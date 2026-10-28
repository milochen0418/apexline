import json
import math

import pytest

from apexline import trackgen

IDS = [d.id for d in trackgen.DESIGNS]


def test_ten_tracks():
    assert len(IDS) == 10 and len(set(IDS)) == 10


@pytest.mark.parametrize("track_id", IDS)
def test_a_track_is_closed_even_and_drivable(track_id):
    t = trackgen.load(track_id)
    n = t["n"]
    assert len(t["x"]) == len(t["y"]) == len(t["z"]) == len(t["line"]) == len(t["grip"]) == len(t["open"]) == n
    gaps = [math.dist((t["x"][i], t["z"][i]), (t["x"][(i + 1) % n], t["z"][(i + 1) % n])) for i in range(n)]
    assert max(gaps) < t["ds"] * 1.3 and min(gaps) > t["ds"] * 0.7, "evenly spaced and closed"
    room = t["width"] / 2 - 1.6
    assert all(abs(d) <= room + 1e-6 for d in t["line"]), "the racing line stays on the road"
    assert 4 <= len(t["corners"]) <= 16 or track_id in ("sunny_oval", "figure_eight")
    for c in t["corners"]:
        assert 10 <= c["radius"] <= 400
        assert c["limit_kmh"] == round(math.sqrt(c["grip"] * trackgen.CAR["lat"] * c["radius"]) * 3.6)
        assert c["dir"] in ("L", "R")
    assert [c["id"] for c in t["corners"]] == [f"C{k + 1}" for k in range(len(t["corners"]))]


@pytest.mark.parametrize("track_id", IDS)
def test_no_two_parts_of_a_road_overlap_except_where_it_crosses(track_id):
    t = trackgen.load(track_id)
    n, step = t["n"], t["ds"]
    clear = t["width"] + 2 * t["shoulder"]
    pts = list(zip(t["x"], t["z"]))
    for i in range(0, n, 3):
        for j in range(0, n, 3):
            if min((i - j) % n, (j - i) % n) * step < 80 or t["open"][i] or t["open"][j]:
                continue
            assert math.dist(pts[i], pts[j]) >= clear, (i, j)


def test_only_the_figure_eight_crosses_itself():
    for track_id in IDS:
        assert bool(sum(trackgen.load(track_id)["open"])) == (track_id == "figure_eight")


def test_the_files_match_the_designs():
    design = trackgen.BY_ID["sunny_oval"]
    assert json.loads(json.dumps(trackgen.build(design))) == trackgen.load("sunny_oval")
