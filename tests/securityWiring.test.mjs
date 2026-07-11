import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

test('frame CSP is added only on requests that load Viewer', async () => {
  const [application, listener, loadViewer, scope] = await Promise.all([
    readFile('lib/AppInfo/Application.php', 'utf8'),
    readFile('lib/Listener/ContentSecurityPolicyListener.php', 'utf8'),
    readFile('lib/Listener/LoadViewerListener.php', 'utf8'),
    readFile('lib/Service/ViewerCspScope.php', 'utf8'),
  ]);

  assert.match(
    application,
    /registerEventListener\(AddContentSecurityPolicyEvent::class, ContentSecurityPolicyListener::class\)/,
  );
  assert.doesNotMatch(listener, /GeoSettings/);
  assert.match(listener, /private ViewerCspScope \$viewerCspScope/);
  assert.match(listener, /!\$this->viewerCspScope->isViewerLoaded\(\)/);
  assert.match(loadViewer, /\$this->viewerCspScope->markViewerLoaded\(\)/);
  assert.match(scope, /private bool \$viewerLoaded = false/);
  assert.match(listener, /\$event->addPolicy\(\$policy\)/);

  const policyCalls = listener
    .match(/^\s*\$policy->[^;]+;/gm)
    ?.map((line) => line.trim());

  assert.deepEqual(policyCalls, [
    "$policy->addAllowedFrameDomain('\\'self\\'');",
    "$policy->addAllowedFrameDomain('blob:');",
  ]);
});

test('CSP listener behavior is request-scoped and adds no worker policy', async () => {
  const phpScript = String.raw`
namespace OCP\EventDispatcher {
	class Event {
	}
	interface IEventListener {
		public function handle(Event $event): void;
	}
}

namespace OCP\AppFramework\Http {
	class EmptyContentSecurityPolicy {
		public array $frameDomains = [];
		public function addAllowedFrameDomain(string $domain): void {
			$this->frameDomains[] = $domain;
		}
	}
}

namespace OCP\Security\CSP {
	class AddContentSecurityPolicyEvent extends \OCP\EventDispatcher\Event {
		public array $policies = [];
		public function addPolicy(object $policy): void {
			$this->policies[] = $policy;
		}
	}
}

namespace {
	require getcwd() . '/lib/Service/ViewerCspScope.php';
	require getcwd() . '/lib/Listener/ContentSecurityPolicyListener.php';

	$scope = new \OCA\FileViewer\Service\ViewerCspScope();
	$listener = new \OCA\FileViewer\Listener\ContentSecurityPolicyListener($scope);
	$unmarked = new \OCP\Security\CSP\AddContentSecurityPolicyEvent();
	$listener->handle($unmarked);

	$scope->markViewerLoaded();
	$marked = new \OCP\Security\CSP\AddContentSecurityPolicyEvent();
	$listener->handle($marked);

	echo json_encode([
		'unmarkedPolicies' => count($unmarked->policies),
		'markedPolicies' => count($marked->policies),
		'frameDomains' => $marked->policies[0]->frameDomains ?? [],
	], JSON_THROW_ON_ERROR);
}
`;

  const { stdout } = await execFileAsync('php', ['-r', phpScript], {
    cwd: new URL('..', import.meta.url),
  });

  assert.deepEqual(JSON.parse(stdout), {
    unmarkedPolicies: 0,
    markedPolicies: 1,
    frameDomains: ["'self'", 'blob:'],
  });
});

test('viewer document has its own worker and parser CSP', async () => {
  const [controller, routes, mainSource] = await Promise.all([
    readFile('lib/Controller/ViewerController.php', 'utf8'),
    readFile('appinfo/routes.php', 'utf8'),
    readFile('src/main.js', 'utf8'),
  ]);

  assert.match(routes, /'name' => 'viewer#show'[\s\S]*?'url' => '\/viewer\/frame'/);
  assert.match(routes, /'name' => 'viewer#epubBootstrap'[\s\S]*?'url' => '\/viewer\/epub-bootstrap'/);
  assert.match(mainSource, /generateUrl\('\/apps\/\{APP_ID\}\/viewer\/frame'/);
  assert.match(mainSource, /generateUrl\('\/apps\/\{APP_ID\}\/viewer\/epub-bootstrap'/);
  assert.match(controller, /new EmptyContentSecurityPolicy\(\)/);
  assert.match(controller, /getServerProtocol\(\).*getServerHost\(\)/);
  assert.match(controller, /new DataDisplayResponse\(\$html\)/);
  assert.match(controller, /linkTo\([\s\S]*?viewer\/file-viewer\/flyfish-file-viewer-web-full\.iife\.js/);
  assert.match(controller, /linkTo\([\s\S]*?viewer\/frame\.js/);
  assert.match(controller, /addAllowedStyleDomain\('blob:'\)/);
  assert.match(controller, /addAllowedWorkerSrcDomain\('blob:'\)/);
  assert.equal(controller.includes("$policy->addAllowedWorkerSrcDomain('\\'self\\'');"), false);
  assert.equal(controller.includes("$policy->addAllowedScriptDomain('\\'unsafe-eval\\'');"), true);
  assert.match(controller, /allowEvalWasm/);
  assert.match(controller, /getAllowedCspOrigins\(\)/);
  assert.match(controller, /public function epubBootstrap\(\): Response/);
  assert.match(controller, /base64_encode\(\$rendererDocument\)/);
  assert.match(controller, /epubContentSecurityPolicy\(\)/);
  assert.match(controller, /addAllowedFormActionDomain\('\\'none\\''\)/);
});

test('settings actions retain AppFramework administrator and CSRF defaults', async () => {
  const source = await readFile('lib/Controller/SettingsController.php', 'utf8');

  assert.match(
    source,
    /AppFramework's defaults, which require\s+ \* authentication, administrator privileges, and CSRF validation\./,
  );
  assert.match(source, /public function saveGeo\(\): DataResponse/);
  assert.match(source, /public function saveMimes\(\): DataResponse/);
  assert.doesNotMatch(source, /AdminRequired/);
  assert.doesNotMatch(source, /NoAdminRequired|NoCSRFRequired|PublicPage/);
});
