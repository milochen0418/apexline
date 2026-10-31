from apexline import store


def _race(track, model, winner, you, ai, plan=None):
    return {"track": track, "model": model, "winner": winner, "you": {"time": you}, "ai": {"time": ai}, "plan": plan}


def test_races_and_the_remembered_plan(tmp_path, monkeypatch):
    monkeypatch.setenv("APEXLINE_DATA_DIR", str(tmp_path))
    assert store.memory("city", "Ollama (qwen3.5:9b)") is None
    store.save_race(_race("city", "Ollama (qwen3.5:9b)", "ai", 160.0, 150.5, {"speeds": {"C1": 60}, "aggression": 2, "version": 3}))
    store.save_race(_race("city", "Ollama (qwen3.5:9b)", "you", 149.0, None))
    store.save_race(_race("city", "Claude (claude-opus-5-5)", "ai", 155.0, 140.0, {"speeds": {"C1": 66}, "version": 1}))
    (tmp_path / "races.jsonl").open("a").write("broken\n")
    mem = store.memory("city", "Ollama (qwen3.5:9b)")
    assert mem["speeds"] == {"C1": 60} and mem["aggression"] == 2 and mem["version"] == 3
    rec = store.records("Ollama (qwen3.5:9b)")["city"]
    assert (rec.you_best, rec.ai_best, rec.wins, rec.losses, rec.remembered) == (149.0, 150.5, 1, 1, 3)
    other = store.records("Claude (claude-opus-5-5)")["city"]
    assert (other.ai_best, other.losses, other.remembered) == (140.0, 1, 1)
    assert store.records("nobody") ["city"].ai_best is None


def test_a_plan_for_other_physics_is_forgotten(tmp_path, monkeypatch):
    monkeypatch.setenv("APEXLINE_DATA_DIR", str(tmp_path))
    store.save_race(_race("city", "m", "ai", 160.0, 150.5, {"speeds": {"C1": 60}, "version": 3}))
    monkeypatch.setattr(store, "PHYSICS", store.PHYSICS + 1)
    assert store.memory("city", "m") is None
    assert store.records("m")["city"].remembered == 0


def test_each_car_has_its_own_plan(tmp_path, monkeypatch):
    monkeypatch.setenv("APEXLINE_DATA_DIR", str(tmp_path))
    store.save_race({**_race("city", "m", "ai", 160.0, 150.5, {"speeds": {"C1": 60}, "version": 2}), "ai_car": "gt"})
    store.save_race({**_race("city", "m", "ai", 160.0, 152.0, {"speeds": {"C1": 66}, "version": 5}), "ai_car": "hornet"})
    assert store.memory("city", "m")["speeds"] == {"C1": 60}
    assert store.memory("city", "m", "hornet")["speeds"] == {"C1": 66}
    assert store.memory("city", "m", "bison") is None
    assert store.records("m")["city"].remembered == 5, "the lobby: it remembers the track in some car"


def test_a_plan_remembered_before_there_was_a_choice_is_the_road_cars(tmp_path, monkeypatch):
    monkeypatch.setenv("APEXLINE_DATA_DIR", str(tmp_path))
    (tmp_path / "memory.json").write_text('{"city|m": {"physics": %d, "speeds": {"C1": 60}, "version": 3}}' % store.PHYSICS)
    assert store.memory("city", "m")["version"] == 3
    assert store.memory("city", "m", "gt")["version"] == 3
    assert store.records("m")["city"].remembered == 3


def test_only_a_song_of_the_shared_library_is_served(tmp_path, monkeypatch):
    from reflex_ddns_auth.collections import Collection

    from apexline.api import song_file

    monkeypatch.setenv("DDNS_COLLECTIONS_ROOT", str(tmp_path))
    monkeypatch.delenv("DDNS_COLLECTIONS_NODE_URL", raising=False)
    with Collection("audio", app_id="music-studio").publish("night-1", kind="audio.file", title="夜行", primary="a.mp3") as item:
        with item.open("a.mp3") as fh:
            fh.write(b"\xff\xfb" * 10)
    with Collection("audio", app_id="music-studio").publish("note-1", kind="audio.note", title="not a song", primary="a.txt") as item:
        with item.open("a.txt") as fh:
            fh.write(b"x")
    assert song_file("audio:music-studio/night-1").name == "a.mp3"
    assert song_file("audio:music-studio/note-1") is None
    assert song_file("audio:music-studio/none") is None
    assert song_file("../../etc/passwd") is None
