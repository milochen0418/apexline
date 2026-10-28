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
