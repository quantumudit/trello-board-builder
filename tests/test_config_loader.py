"""
Tests for utils/config_loader.py -- property defaults, loading, and secret validation.
"""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from exceptions import AppException
from utils.config_loader import Config

_MINIMAL_YAML: dict = {
    "board": {"name": "Test Board"},
    "lists": ["To Do", "Done"],
    "labels": [{"name": "High", "color": "red"}],
    "input": {"file_path": "inputs/cards.json"},
}

_FULL_YAML: dict = {
    "trello": {
        "api_base_url": "https://custom.trello.com/1",
        "rate_limit_delay_seconds": 0.5,
    },
    "board": {
        "name": "Full Board",
        "description": "A full board",
        "permission_level": "public",
        "create_if_not_exists": False,
    },
    "lists": ["Backlog", "Done"],
    "labels": [{"name": "Low", "color": "green"}],
    "input": {"file_path": "inputs/other.json"},
}


@pytest.fixture
def minimal_yaml(tmp_path: Path) -> Path:
    """Write a minimal YAML config and return its path."""
    p = tmp_path / "settings.yaml"
    p.write_text(yaml.dump(_MINIMAL_YAML), encoding="utf-8")
    return p


@pytest.fixture
def full_yaml(tmp_path: Path) -> Path:
    """Write a full YAML config with all optional fields set and return its path."""
    p = tmp_path / "settings.yaml"
    p.write_text(yaml.dump(_FULL_YAML), encoding="utf-8")
    return p


@pytest.fixture
def empty_env(tmp_path: Path) -> Path:
    """Return path to an empty .env file (no credentials)."""
    p = tmp_path / ".env"
    p.write_text("", encoding="utf-8")
    return p


class TestConfigLoading:
    def test_loads_valid_yaml(self, minimal_yaml: Path, empty_env: Path) -> None:
        cfg = Config(yaml_path=str(minimal_yaml), env_path=str(empty_env))
        assert cfg.board_name == "Test Board"

    def test_raises_when_yaml_missing(self, tmp_path: Path, empty_env: Path) -> None:
        with pytest.raises(AppException, match="Config file not found"):
            Config(yaml_path=str(tmp_path / "missing.yaml"), env_path=str(empty_env))

    def test_raw_returns_underlying_dict(
        self, minimal_yaml: Path, empty_env: Path
    ) -> None:
        cfg = Config(yaml_path=str(minimal_yaml), env_path=str(empty_env))
        raw = cfg.raw()
        assert isinstance(raw, dict)
        assert raw["board"]["name"] == "Test Board"


class TestConfigSecrets:
    def test_api_key_read_from_env(
        self, minimal_yaml: Path, empty_env: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("TRELLO_API_KEY", "test_key_123")
        cfg = Config(yaml_path=str(minimal_yaml), env_path=str(empty_env))
        assert cfg.api_key == "test_key_123"

    def test_token_read_from_env(
        self, minimal_yaml: Path, empty_env: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setenv("TRELLO_TOKEN", "test_token_456")
        cfg = Config(yaml_path=str(minimal_yaml), env_path=str(empty_env))
        assert cfg.token == "test_token_456"

    def test_raises_when_api_key_absent(
        self, minimal_yaml: Path, empty_env: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.delenv("TRELLO_API_KEY", raising=False)
        cfg = Config(yaml_path=str(minimal_yaml), env_path=str(empty_env))
        with pytest.raises(AppException, match="TRELLO_API_KEY not set"):
            _ = cfg.api_key

    def test_raises_when_token_absent(
        self, minimal_yaml: Path, empty_env: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.delenv("TRELLO_TOKEN", raising=False)
        cfg = Config(yaml_path=str(minimal_yaml), env_path=str(empty_env))
        with pytest.raises(AppException, match="TRELLO_TOKEN not set"):
            _ = cfg.token


class TestConfigDefaults:
    def test_api_base_url_default(self, minimal_yaml: Path, empty_env: Path) -> None:
        cfg = Config(yaml_path=str(minimal_yaml), env_path=str(empty_env))
        assert cfg.api_base_url == "https://api.trello.com/1"

    def test_rate_limit_delay_default(
        self, minimal_yaml: Path, empty_env: Path
    ) -> None:
        cfg = Config(yaml_path=str(minimal_yaml), env_path=str(empty_env))
        assert cfg.rate_limit_delay == 0.15

    def test_board_description_default(
        self, minimal_yaml: Path, empty_env: Path
    ) -> None:
        cfg = Config(yaml_path=str(minimal_yaml), env_path=str(empty_env))
        assert cfg.board_description == ""

    def test_board_permission_default(
        self, minimal_yaml: Path, empty_env: Path
    ) -> None:
        cfg = Config(yaml_path=str(minimal_yaml), env_path=str(empty_env))
        assert cfg.board_permission == "private"

    def test_create_if_not_exists_default(
        self, minimal_yaml: Path, empty_env: Path
    ) -> None:
        cfg = Config(yaml_path=str(minimal_yaml), env_path=str(empty_env))
        assert cfg.create_if_not_exists is True


class TestConfigValues:
    def test_api_base_url_from_yaml(self, full_yaml: Path, empty_env: Path) -> None:
        cfg = Config(yaml_path=str(full_yaml), env_path=str(empty_env))
        assert cfg.api_base_url == "https://custom.trello.com/1"

    def test_rate_limit_delay_from_yaml(self, full_yaml: Path, empty_env: Path) -> None:
        cfg = Config(yaml_path=str(full_yaml), env_path=str(empty_env))
        assert cfg.rate_limit_delay == 0.5

    def test_board_name(self, full_yaml: Path, empty_env: Path) -> None:
        cfg = Config(yaml_path=str(full_yaml), env_path=str(empty_env))
        assert cfg.board_name == "Full Board"

    def test_board_description(self, full_yaml: Path, empty_env: Path) -> None:
        cfg = Config(yaml_path=str(full_yaml), env_path=str(empty_env))
        assert cfg.board_description == "A full board"

    def test_board_permission(self, full_yaml: Path, empty_env: Path) -> None:
        cfg = Config(yaml_path=str(full_yaml), env_path=str(empty_env))
        assert cfg.board_permission == "public"

    def test_create_if_not_exists_false(self, full_yaml: Path, empty_env: Path) -> None:
        cfg = Config(yaml_path=str(full_yaml), env_path=str(empty_env))
        assert cfg.create_if_not_exists is False

    def test_lists(self, full_yaml: Path, empty_env: Path) -> None:
        cfg = Config(yaml_path=str(full_yaml), env_path=str(empty_env))
        assert cfg.lists == ["Backlog", "Done"]

    def test_labels(self, full_yaml: Path, empty_env: Path) -> None:
        cfg = Config(yaml_path=str(full_yaml), env_path=str(empty_env))
        assert cfg.labels == [{"name": "Low", "color": "green"}]

    def test_input_file_path(self, full_yaml: Path, empty_env: Path) -> None:
        cfg = Config(yaml_path=str(full_yaml), env_path=str(empty_env))
        assert cfg.input_file_path == Path("inputs/other.json")
