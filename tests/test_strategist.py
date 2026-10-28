from apexline import strategist, trackgen


def _track():
    return trackgen.load("city")


def test_the_brief_lists_every_corner_with_its_radius_and_grip():
    t = _track()
    zh = strategist.brief(t, "zh")
    en = strategist.brief(t, "en")
    for c in t["corners"]:
        assert f"{c['id']}：" in zh and f"半徑 {c['radius']} 公尺" in zh
        assert f"{c['id']}: " in en and f"radius {c['radius']} m" in en
    assert "城市街道" in zh and "City Blocks" in en


def test_sand_and_ice_are_named_where_the_grip_changes():
    desert = trackgen.load("desert")
    text = strategist.brief(desert, "zh")
    assert ("沙地" in text) == any(c["grip"] < 1 for c in desert["corners"])


def test_the_first_message_asks_for_lap_one_and_later_ones_report_the_lap():
    t = _track()
    first = strategist.user_message(t, "zh", [], None, None)
    assert first.startswith("賽道") and first.endswith("請給第 1 圈的計畫。")
    report = {"lap": 1, "secs": 75.2, "rival_secs": 80.1, "ahead_m": 120, "bumps": 2, "corners": [{"id": "C1", "plan": 60, "entry": 61, "min": 52, "wide": 6.3, "wall": True}, {"id": "C2", "plan": 50, "entry": 50, "min": 49, "wide": 0.8, "wall": False}]}
    later = strategist.user_message(t, "zh", [{"role": "user", "content": first}, {"role": "assistant", "content": "C1: 60"}], report, None)
    assert "第 1 圈跑完" in later and "領先對手約 120 公尺" in later and "相撞 2 次" in later
    assert "C1：計畫 60 → 進彎 61 / 最低 52，偏離賽車線 6.3 公尺，撞牆了" in later
    assert "C2：計畫 50 → 進彎 50 / 最低 49，偏離賽車線 0.8 公尺" in later
    assert later.endswith("請給第 2 圈的計畫（每個彎道都要寫）。")
    assert "半徑" not in later, "the track is told once"


def test_a_remembered_plan_is_told_when_the_conversation_starts_without_it():
    t = _track()
    plan = {"speeds": {c["id"]: 50 for c in t["corners"]}, "aggression": 2}
    text = strategist.user_message(t, "en", [], {"lap": 1, "secs": 70, "corners": []}, plan)
    assert "The plan you are driving: C1 50" in text and "aggression 2" in text and "Lap 1 done" in text


def test_the_plan_is_read_from_the_reply():
    t = _track()
    ids = [c["id"] for c in t["corners"]]
    reply = "\n".join(f"**{cid}:** {60 + k}" for k, cid in enumerate(ids)) + "\n積極度：3\n說明：城市彎多，先穩。"
    plan = strategist.parse(reply, t)
    assert plan.speeds == {cid: 60 + k for k, cid in enumerate(ids)}
    assert plan.aggression == 3 and plan.note == "城市彎多，先穩。" and plan.complete


def test_full_width_and_thinking_are_handled_and_gaps_keep_the_old_speed():
    t = _track()
    ids = [c["id"] for c in t["corners"]]
    keep = ids[-1]
    reply = "<think>C1: 999</think>" + "\n".join(f"Ｃ{k + 1}：{70}" for k in range(len(ids) - 1)) + "\nAggression: 0\nNote: easy"
    previous = {"speeds": {keep: 44}, "aggression": 2}
    plan = strategist.parse(reply, t, previous)
    assert plan.speeds[ids[0]] == 70, "the speed inside <think> is ignored"
    assert plan.speeds[keep] == 44 and not plan.complete
    assert plan.aggression == 0


def test_too_few_corners_is_no_plan_and_speeds_are_kept_sane():
    t = _track()
    assert strategist.parse("C1: 50", t) is None
    ids = [c["id"] for c in t["corners"]]
    plan = strategist.parse("\n".join(f"{cid}: {9000 if k == 0 else 1}" for k, cid in enumerate(ids)), t)
    assert plan.speeds[ids[0]] == 200 and plan.speeds[ids[1]] == 10


def test_a_long_conversation_keeps_its_start_and_its_end():
    history = [{"role": "user" if k % 2 == 0 else "assistant", "content": str(k)} for k in range(30)]
    kept = strategist.trim(history)
    assert [m["content"] for m in kept[:2]] == ["0", "1"]
    assert kept[-1]["content"] == "29" and len(kept) == strategist.KEEP + 2
