#!/usr/bin/env python3
"""Run only on an explicitly authorized isolated Linux image store, never production.

Usage: python3 image-http-qualification.py ROOT IMAGE OUTPUT [--expect-permission-failure]
The ROOT contains context/ and this task's isolated store/run. No published port,
PocketBase, host mount, secret, or alternative nginx user/config is permitted.
"""
import hashlib
import json
import subprocess
import sys
import time
from pathlib import Path

root = Path(sys.argv[1]).resolve()
image, output = sys.argv[2:4]
expect_failure = sys.argv[4:] == ['--expect-permission-failure']
engine = ['/usr/bin/podman', '--root', str(root/'store'), '--runroot', str(root/'run'),
          '--storage-driver', 'vfs', '--cgroup-manager', 'cgroupfs', '--events-backend', 'file']
name = 'qrcode-permissions-http-67af'
receipt = json.loads((root/'context/.monitoring-private/upload-receipt.json').read_text())
report = {'image': image, 'network': 'none', 'publishedPorts': [], 'pbAttached': False,
          'expectedPermissionFailure': expect_failure, 'checks': []}

def run(args, check=True):
    result = subprocess.run(engine+args, capture_output=True, timeout=40)
    if check and result.returncode:
        raise RuntimeError('isolated container command failed: '+result.stderr.decode(errors='replace')[-500:])
    return result

try:
    run(['run', '--detach', '--name', name, '--network', 'none', '--memory', '128m',
         '--pids-limit', '64', '--label', 'io.suislink.owner=copilot-67af-qrcode-sentry', image])
    for _ in range(20):
        probe = run(['exec', name, 'wget', '-qO-', 'http://127.0.0.1/index.html'], check=False)
        if probe.returncode == 0 or b'403 Forbidden' in probe.stderr:
            break
        time.sleep(0.25)
    report['processes'] = run(['top', name, 'user', 'huser', 'args']).stdout.decode()
    workers = [line.split() for line in report['processes'].splitlines()
               if 'nginx: worker process' in line]
    if not workers or any(line[0] != 'nginx' or line[1] == '0' for line in workers):
        raise RuntimeError('normal nonroot nginx worker not running')
    for relative, expected in receipt['publicFiles'].items():
        probe = run(['exec', name, 'wget', '-S', '-O', '-', 'http://127.0.0.1/'+relative], check=False)
        status = 200 if b'200 OK' in probe.stderr else 403 if b'403 Forbidden' in probe.stderr else None
        actual = hashlib.sha256(probe.stdout).hexdigest() if status == 200 else None
        report['checks'].append({'path': relative, 'status': status, 'sha256': actual})
        if not expect_failure and (status != 200 or actual != expected):
            raise RuntimeError('actual nginx static HTTP/hash failed: '+relative)
    fallback = run(['exec', name, 'wget', '-S', '-O', '-', 'http://127.0.0.1/oauth-callback/deep-route'], check=False)
    report['deepOAuthFallback'] = {'status': 200 if b'200 OK' in fallback.stderr else None,
        'sha256': hashlib.sha256(fallback.stdout).hexdigest()}
    if not expect_failure and report['deepOAuthFallback'] != {'status': 200, 'sha256': receipt['publicFiles']['index.html']}:
        raise RuntimeError('deep OAuth SPA fallback did not return exact index')
    logs = run(['logs', name]).stdout.decode(errors='replace') + run(['logs', name]).stderr.decode(errors='replace')
    report['permissionDenied'] = 'Permission denied' in logs
    report['forbidden403'] = ' 403 ' in logs or any(c['status'] == 403 for c in report['checks'])
    report['runtimeLog'] = logs
    report['publicModes'] = run(['exec', name, 'sh', '-c',
        'find /usr/share/nginx/html -type d -exec stat -c "%a %n" {} \\; ; find /usr/share/nginx/html -type f -exec stat -c "%a %n" {} \\;']).stdout.decode()
    if expect_failure:
        if not report['permissionDenied'] or not report['forbidden403']:
            raise RuntimeError('old Dockerfile failed for a different reason, not permission403')
        report['redReproduced'] = True
        report['success'] = False
    else:
        if report['permissionDenied'] or report['forbidden403']:
            raise RuntimeError('runtime logs contain permissions/403 failure')
        for line in report['publicModes'].splitlines():
            if not line.startswith(('755 ', '644 ')):
                raise RuntimeError('unexpected public mode: '+line)
        report['success'] = True
except Exception as error:
    report['success'] = False
    report['error'] = str(error)
finally:
    run(['rm', '--force', name], check=False)
    Path(output).write_text(json.dumps(report, indent=2))
print(json.dumps({key: value for key, value in report.items() if key not in ['runtimeLog', 'processes']}, indent=2))
sys.exit(0 if report.get('success') else 1)
