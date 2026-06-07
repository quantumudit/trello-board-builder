"""
logger.py

Configures and provides a project-wide logger using loguru.

Features:
    - Colorful, formatted output to the console.
    - Timestamped log file written to the 'logs/' directory.
    - Single import: from core.logger import logger

Typical usage:
    from core.logger import logger
    logger.info("Your log message here")
"""

import sys
from pathlib import Path

import pendulum
from loguru import logger
from rich.traceback import install as _install_rich_traceback

_TIMEZONE = "Asia/Kolkata"
_HOUR_FORMAT = 12

# Force UTF-8 on stdout so Unicode icons render correctly on Windows terminals
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# Install rich as the global unhandled-exception renderer
_install_rich_traceback(show_locals=True)
# -------------------------------------------------------
# Paths
# -------------------------------------------------------
LOGS_DIR = Path.cwd() / "logs"
LOGS_DIR.mkdir(exist_ok=True)

_now = pendulum.now(_TIMEZONE)
_ts_fmt = "YYYY_MM_DD_hh_mm_ss_A" if _HOUR_FORMAT == 12 else "YYYY_MM_DD_HH_mm_ss"
timestamp = _now.format(_ts_fmt)
LOG_FILE_PATH = LOGS_DIR / f"{timestamp}.log"


# -------------------------------------------------------
# Formats
# -------------------------------------------------------
_time_fmt = "YYYY-MM-DD hh:mm:ss A" if _HOUR_FORMAT == 12 else "YYYY-MM-DD HH:mm:ss"

CONSOLE_FORMAT = (
    f"<green>{{time:{_time_fmt}}}</green> | "
    "<level>{level.icon} {level: <8}</level> | "
    "<cyan>{name}</cyan>:<cyan>{line}</cyan> - "
    "<level>{message}</level>"
)

FILE_FORMAT = f"{{time:{_time_fmt}}} | {{level: <8}} | {{name}}:{{line}} - {{message}}"


# -------------------------------------------------------
# Setup
# -------------------------------------------------------
logger.remove()  # Remove the default handler

# Convert every record's time to the configured timezone
logger.patch(lambda record: record.update(time=record["time"].in_timezone(_TIMEZONE)))

# -------------------------------------------------------
# Level icons
# -------------------------------------------------------
logger.level("TRACE", color="<dim>", icon="-")
logger.level("DEBUG", color="<blue>", icon="~")
logger.level("INFO", color="<white>", icon="*")
logger.level("SUCCESS", color="<bold><green>", icon="\u2714")  # heavy check
logger.level("WARNING", color="<bold><yellow>", icon="!")
logger.level("ERROR", color="<bold><red>", icon="\u2717")  # light cross
logger.level("CRITICAL", color="<bold><white><RED>", icon="\u2718")  # heavy cross

logger.add(
    sys.stdout,
    format=CONSOLE_FORMAT,
    level="TRACE",
    colorize=True,
    diagnose=True,
)

logger.add(
    LOG_FILE_PATH,
    format=FILE_FORMAT,
    level="TRACE",
    encoding="utf-8",
    rotation="10 MB",
    retention=10,
    diagnose=True,
)
