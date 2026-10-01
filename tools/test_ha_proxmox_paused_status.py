"""Exercise the injected coordinator logic without HA or a Proxmox connection."""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import Mock
from types import SimpleNamespace
spec = importlib.util.spec_from_file_location('patcher', Path(__file__).with_name('ha-proxmox-paused-status.py'))
patcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(patcher)

class PatchTests(unittest.TestCase):
    def evaluate(self, status, qmpstatus, error=None):
        vm = {'vmid': 603, 'status': status}
        qemu = Mock()
        qemu.get.return_value = [vm]
        qemu.return_value.status.current.get.return_value = {'qmpstatus': qmpstatus}
        if error:
            qemu.return_value.status.current.get.side_effect = error
        obj = Mock()
        obj.proxmox.nodes.return_value.qemu = qemu
        source = 'def fetch(self, node):\n' + patcher.NEW + '        return vms\n'
        namespace = {'CONF_NODE': 'node', 'ResourceException': RuntimeError, 'requests': SimpleNamespace(exceptions=SimpleNamespace(ConnectionError=ConnectionError))}
        exec(source, namespace)
        result = namespace['fetch'](obj, {'node': 'pve01'})
        return result[0], qemu

    def test_paused_and_suspended(self):
        for state in ('paused', 'suspended'):
            self.assertEqual(self.evaluate('running', state)[0]['status'], 'suspended')

    def test_running_and_unknown(self):
        for state in ('running', None, 'prelaunch'):
            self.assertEqual(self.evaluate('running', state)[0]['status'], 'running')

    def test_stopped_skips_extra_request(self):
        vm, qemu = self.evaluate('stopped', 'paused')
        self.assertEqual(vm['status'], 'stopped')
        qemu.assert_not_called()

    def test_failed_fetch_does_not_publish_running(self):
        with self.assertRaises(RuntimeError):
            self.evaluate('running', 'paused', RuntimeError('permission denied'))

    def test_source_guard(self):
        with self.assertRaises(RuntimeError):
            patcher.patch('different source')

if __name__ == '__main__':
    unittest.main()
