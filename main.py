"""
Entry point. Wires Config, TrelloClient, BoardManager, and CardBuilder together.
"""

from __future__ import annotations

import argparse
import sys

from core.board_manager import BoardManager
from core.card_builder import CardBuilder
from core.trello_client import TrelloClient
from shared.exceptions import AppException
from shared.logger import logger
from utils.config_loader import Config
from utils.input_loader import load_cards


def parse_args() -> argparse.Namespace:
    """Parse and return CLI arguments.

    Returns:
        Parsed namespace with config and env attributes.
    """
    parser = argparse.ArgumentParser(description="Trello Board Builder")
    parser.add_argument(
        "--config",
        default="config/settings.yaml",
        help="Path to YAML config file (default: config/settings.yaml)",
    )
    parser.add_argument(
        "--env",
        default=".env",
        help="Path to .env secrets file (default: .env)",
    )
    return parser.parse_args()


def main() -> None:
    """Orchestrate the full board-building flow from config to card creation."""
    args = parse_args()
    config = Config(yaml_path=args.config, env_path=args.env)

    logger.info("Starting Trello Board Builder - board: {}", config.board_name)

    cards = load_cards(config)

    client = TrelloClient(config)
    board_manager = BoardManager(client, config)
    board_manager.setup()

    card_builder = CardBuilder(client, board_manager)
    card_builder.build_all(cards)

    logger.success(
        "Done. Board '{}' is ready: https://trello.com/b/{}",
        config.board_name,
        board_manager.board_id,
    )


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        logger.warning("Interrupted by user.")
        sys.exit(0)
    except AppException as exc:
        exc.log()
        sys.exit(1)
    except Exception as exc:
        logger.opt(exception=True).critical("Unexpected error: {}", exc)
        sys.exit(1)
