"""Offline stdlib tests: fake GitHub objects only, no keys or network."""
import base64
import copy
import hashlib
import json
import unittest

from identity_ledger import ApiError, IdentityLedger, LedgerError, REF


class FakeApi:
    def __init__(self):
        self.calls = []
        self.objects = {}
        self.ref = None
        self.fail_create_ref = False
        self.uncertain_create_ref = False
        self.uncertain_patch = False
        self.fail_patch = False
        self.fail_commit = False
        self.change_ref_on_second_complete_read = False
        self.complete_reads = 0

    def put(self, obj):
        sha = hashlib.sha1(json.dumps(obj, sort_keys=True).encode()).hexdigest()
        self.objects[sha] = copy.deepcopy(obj)
        return sha

    def request(self, method, path, payload=None):
        self.calls.append((method, path, copy.deepcopy(payload)))
        suffix = path.split('/git', 1)[1]
        if method == 'GET' and suffix.startswith('/ref/'):
            self.complete_reads += 1
            if self.change_ref_on_second_complete_read and self.complete_reads == 2:
                self.ref = 'f' * 40
            if self.ref is None:
                raise ApiError(404)
            return {'ref': REF, 'object': {'type': 'commit', 'sha': self.ref}}
        if method == 'POST' and suffix == '/trees':
            entries = []
            for item in payload['tree']:
                blob = {'encoding': 'base64', 'content': base64.b64encode(item['content'].encode()).decode()}
                entries.append({'path': item['path'], 'mode': item['mode'], 'type': item['type'], 'sha': self.put(blob)})
            return {'sha': self.put({'tree': entries, 'truncated': False})}
        if method == 'POST' and suffix == '/commits':
            if self.fail_commit:
                raise ApiError(500)
            return {'sha': self.put({'tree': {'sha': payload['tree']}, 'parents': payload['parents']})}
        if method == 'POST' and suffix == '/refs':
            if self.ref is not None or self.fail_create_ref:
                raise ApiError(422)
            self.ref = payload['sha']
            if self.uncertain_create_ref:
                raise LedgerError('MOCK: response lost after ref was created.')
            return {'ref': REF, 'object': {'type': 'commit', 'sha': self.ref}}
        if method == 'PATCH' and suffix.startswith('/refs/'):
            if self.fail_patch:
                raise ApiError(500)
            assert payload['force'] is False
            target = self.objects[payload['sha']]
            if target['parents'] != [self.ref]:
                raise ApiError(422)
            self.ref = payload['sha']
            if self.uncertain_patch:
                raise LedgerError('MOCK: response lost after ref update.')
            return {'ref': REF, 'object': {'type': 'commit', 'sha': self.ref}}
        if method == 'GET' and any(suffix.startswith('/' + kind + '/') for kind in ('commits', 'trees', 'blobs')):
            return copy.deepcopy(self.objects[suffix.rsplit('/', 1)[1]])
        raise AssertionError(f'Unexpected fake API operation: {method} {suffix}')


class IdentityLedgerTests(unittest.TestCase):
    def setUp(self):
        self.api = FakeApi()
        self.ledger = IdentityLedger(self.api, 'example/public-repository')
        self.reserve_args = dict(run_id='123', source_sha='a' * 40, timestamp='2026-10-28T00:00:00Z')

    def completion_args(self, reservation):
        return dict(self.reserve_args, reservation_sha=reservation,
                    certificate_sha256='b' * 64, artifact_sha256='c' * 64, artifact_id='456')

    def assert_no_dangerous_operations(self):
        for method, path, data in self.api.calls:
            self.assertNotEqual(method, 'DELETE')
            self.assertNotIn('/actions/', path)
            if method == 'PATCH':
                self.assertIs(data['force'], False)

    def test_reserve_is_orphan_tree_with_only_public_json(self):
        reservation = self.ledger.reserve(**self.reserve_args)
        self.assertEqual(reservation, self.api.ref)
        self.assertEqual(self.api.objects[reservation]['parents'], [])
        tree_requests = [data for method, path, data in self.api.calls if method == 'POST' and path.endswith('/trees')]
        self.assertNotIn('base_tree', tree_requests[0])
        self.assertEqual([x['path'] for x in tree_requests[0]['tree']], ['identity-state.json'])
        state, _ = self.ledger._read_state(reservation)
        self.assertEqual(state['status'], 'RESERVED')
        self.assertEqual(set(state), {'schema', 'status', 'repository', 'run_id', 'source_sha', 'reserved_at'})
        self.assert_no_dangerous_operations()

    def test_existing_reserved_fails_without_writes(self):
        reservation = self.ledger.reserve(**self.reserve_args)
        self.api.calls.clear()
        with self.assertRaisesRegex(LedgerError, 'already exists'):
            self.ledger.reserve(**self.reserve_args)
        self.assertEqual(self.api.ref, reservation)
        self.assertEqual([x[0] for x in self.api.calls], ['GET'])

    def test_existing_ready_fails_without_writes(self):
        reservation = self.ledger.reserve(**self.reserve_args)
        ready = self.ledger.complete(**self.completion_args(reservation))
        self.api.calls.clear()
        with self.assertRaisesRegex(LedgerError, 'already exists'):
            self.ledger.reserve(**self.reserve_args)
        self.assertEqual(self.api.ref, ready)
        self.assertEqual([x[0] for x in self.api.calls], ['GET'])

    def test_create_ref_race_422_never_falls_back_to_update(self):
        self.api.fail_create_ref = True
        with self.assertRaises(ApiError) as error:
            self.ledger.reserve(**self.reserve_args)
        self.assertEqual(error.exception.status, 422)
        self.assertFalse(any(x[0] in ('PATCH', 'DELETE') for x in self.api.calls))
        self.assertIsNone(self.api.ref)

    def test_uncertain_reserve_keeps_claim_and_cannot_be_repeated(self):
        self.api.uncertain_create_ref = True
        with self.assertRaisesRegex(LedgerError, 'response lost'):
            self.ledger.reserve(**self.reserve_args)
        claimed = self.api.ref
        self.assertIsNotNone(claimed)
        self.api.calls.clear()
        with self.assertRaisesRegex(LedgerError, 'already exists'):
            self.ledger.reserve(**self.reserve_args)
        self.assertEqual(self.api.ref, claimed)
        self.assertEqual([x[0] for x in self.api.calls], ['GET'])

    def test_partial_failure_after_reservation_preserves_claim(self):
        reservation = self.ledger.reserve(**self.reserve_args)
        # Artifact creation could fail here. No completion means no READY.
        state, _ = self.ledger._read_state(reservation)
        self.assertEqual(state['status'], 'RESERVED')
        self.api.fail_commit = True
        with self.assertRaises(ApiError):
            self.ledger.complete(**self.completion_args(reservation))
        self.assertEqual(self.api.ref, reservation)
        self.assertFalse(any(x[0] in ('PATCH', 'DELETE') for x in self.api.calls))

    def test_wrong_expected_ref_stops_before_writes(self):
        reservation = self.ledger.reserve(**self.reserve_args)
        self.api.calls.clear()
        with self.assertRaisesRegex(LedgerError, 'no longer matches'):
            self.ledger.complete(**self.completion_args('d' * 40))
        self.assertEqual(self.api.ref, reservation)
        self.assertEqual([x[0] for x in self.api.calls], ['GET'])

    def test_wrong_run_or_source_stops(self):
        reservation = self.ledger.reserve(**self.reserve_args)
        for field, wrong in [('run_id', '999'), ('source_sha', 'e' * 40)]:
            args = self.completion_args(reservation)
            args[field] = wrong
            self.api.calls.clear()
            with self.assertRaisesRegex(LedgerError, 'identity mismatch'):
                self.ledger.complete(**args)
            self.assertFalse(any(x[0] != 'GET' for x in self.api.calls))
            self.assertEqual(self.api.ref, reservation)

    def test_valid_completion_parent_and_metadata(self):
        reservation = self.ledger.reserve(**self.reserve_args)
        ready = self.ledger.complete(**self.completion_args(reservation))
        self.assertEqual(self.api.ref, ready)
        self.assertEqual(self.api.objects[ready]['parents'], [reservation])
        state, _ = self.ledger._read_state(ready)
        self.assertEqual(state['status'], 'READY')
        self.assertEqual(state['certificate_sha256'], 'b' * 64)
        self.assertEqual(state['artifact_sha256'], 'c' * 64)
        self.assertEqual(state['artifact_id'], '456')
        self.assertFalse(state['backup_recovery_verified'])
        self.assert_no_dangerous_operations()

    def test_completion_update_failure_preserves_reservation(self):
        reservation = self.ledger.reserve(**self.reserve_args)
        self.api.fail_patch = True
        with self.assertRaises(ApiError):
            self.ledger.complete(**self.completion_args(reservation))
        self.assertEqual(self.api.ref, reservation)
        self.assert_no_dangerous_operations()

    def test_uncertain_completion_requires_inspection_not_retry(self):
        reservation = self.ledger.reserve(**self.reserve_args)
        self.api.uncertain_patch = True
        with self.assertRaisesRegex(LedgerError, 'response lost'):
            self.ledger.complete(**self.completion_args(reservation))
        ready = self.api.ref
        self.assertNotEqual(ready, reservation)
        self.api.calls.clear()
        with self.assertRaisesRegex(LedgerError, 'no longer matches'):
            self.ledger.complete(**self.completion_args(reservation))
        self.assertEqual(self.api.ref, ready)
        self.assertEqual([x[0] for x in self.api.calls], ['GET'])

    def test_concurrent_completion_change_ref_fails_closed(self):
        reservation = self.ledger.reserve(**self.reserve_args)
        self.api.calls.clear()
        self.api.complete_reads = 0
        self.api.change_ref_on_second_complete_read = True
        with self.assertRaisesRegex(LedgerError, 'changed during completion'):
            self.ledger.complete(**self.completion_args(reservation))
        self.assertFalse(any(x[0] == 'PATCH' for x in self.api.calls))
        self.assertEqual(self.api.ref, 'f' * 40)

    def test_invalid_inputs_never_call_api(self):
        for field, wrong in [('run_id', '0'), ('source_sha', 'not-a-sha'), ('timestamp', 'no-time')]:
            args = dict(self.reserve_args)
            args[field] = wrong
            with self.assertRaises(LedgerError):
                self.ledger.reserve(**args)
        self.assertEqual(self.api.calls, [])


if __name__ == '__main__':
    unittest.main()
