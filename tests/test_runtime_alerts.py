from runtime_alerts import OutageTracker


def test_a_restart_that_recovers_in_time_says_nothing():
    tracker = OutageTracker(threshold=2, min_outage_seconds=420)
    events = [tracker.observe(False, t) for t in (0, 30, 60, 90, 120, 150)]
    assert events == [None] * 6
    assert tracker.observe(True, 180) is None  # no alert was sent, so no «recovered» either


def test_a_lasting_outage_alerts_once_and_then_reports_recovery():
    tracker = OutageTracker(threshold=2, min_outage_seconds=420)
    events = [tracker.observe(False, t) for t in range(0, 600, 30)]
    assert events.count('alert') == 1
    assert events.index('alert') == 14  # the check at t = 420 s, not earlier
    assert tracker.observe(True, 700) == 'recovered'
    assert tracker.observe(True, 730) is None


def test_the_failure_count_alone_is_not_enough():
    tracker = OutageTracker(threshold=2, min_outage_seconds=0)
    assert tracker.observe(False, 0) is None
    assert tracker.observe(False, 1) == 'alert'


def test_a_flapping_backend_restarts_the_clock():
    tracker = OutageTracker(threshold=2, min_outage_seconds=300)
    for t in (0, 60, 120, 180):
        assert tracker.observe(False, t) is None
    assert tracker.observe(True, 240) is None
    for t in (270, 330, 390, 450):
        assert tracker.observe(False, t) is None
    assert tracker.observe(False, 570) == 'alert'
