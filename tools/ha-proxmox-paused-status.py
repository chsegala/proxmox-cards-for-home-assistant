"""Install a reversible local override of HA's bundled official Proxmox integration.

Run inside the Home Assistant container with --install. No credentials are read.
The override must be rebased or removed after Home Assistant upgrades.
"""
import argparse
import importlib.util
import json
from pathlib import Path
import shutil
import compileall

OLD = '        vms = self.proxmox.nodes(node[CONF_NODE]).qemu.get() or []\n'
NEW = '''        vms = self.proxmox.nodes(node[CONF_NODE]).qemu.get() or []
        # Local paused-status fix: process status remains running for paused QEMU.
        for vm in vms:
            if vm.get("status") != "running":
                continue
            try:
                current = self.proxmox.nodes(node[CONF_NODE]).qemu(
                    vm["vmid"]
                ).status.current.get() or {}
            except (ResourceException, requests.exceptions.ConnectionError):
                # Fail this node's refresh rather than publish a misleading state.
                # The coordinator marks its entities unavailable and retries polling.
                raise
            vm["qmpstatus"] = current.get("qmpstatus")
            if vm["qmpstatus"] in {"paused", "suspended"}:
                vm["status"] = "suspended"
'''

def patch(source: str) -> str:
    if source.count(OLD) != 1:
        raise RuntimeError('Installed coordinator differs from the reviewed source; refusing to patch.')
    return source.replace(OLD, NEW)

def install(config: Path = Path('/config')) -> None:
    spec = importlib.util.find_spec('homeassistant')
    if not spec or not spec.origin:
        raise RuntimeError('Run this installer inside the Home Assistant container.')
    bundled = Path(spec.origin).parent / 'components/proxmoxve'
    target = config / 'custom_components/proxmoxve'
    if target.exists():
        raise RuntimeError('An override already exists; refusing to overwrite it.')
    source = patch((bundled / 'coordinator.py').read_text())
    backups = config / 'proxmox-cards-patches'
    backups.mkdir(exist_ok=True)
    backup = backups / 'proxmoxve-bundled-before-paused-fix'
    if backup.exists():
        raise RuntimeError('Backup already exists; review it before reinstalling.')
    shutil.copytree(bundled, backup, ignore=shutil.ignore_patterns('__pycache__'))
    staging = backups / 'proxmoxve-staging'
    shutil.copytree(bundled, staging, ignore=shutil.ignore_patterns('__pycache__'))
    (staging / 'coordinator.py').write_text(source)
    manifest_path = staging / 'manifest.json'
    manifest = json.loads(manifest_path.read_text())
    manifest['version'] = '0.1.0+paused-status-fix'
    manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
    if not compileall.compile_dir(staging, quiet=1):
        raise RuntimeError('Compilation failed; override was not activated.')
    target.parent.mkdir(exist_ok=True)
    staging.rename(target)
    print(f'Installed {target}; original snapshot: {backup}. Restart HA to activate.')

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--install', action='store_true', required=True)
    parser.parse_args()
    install()
