"""
exceptions.py

Project-wide custom exception utilities built on top of loguru.

Features:
    - error_details(): one-line summary of file, function, line, and message
    - format_traceback(): full formatted traceback as a plain string
    - AppException: base exception with built-in .log() integration
    - catch: re-exported loguru decorator / context manager for safe wrapping

Typical usage:
    from core.exceptions import AppException, catch

    @catch
    def risky_call():
        ...

    try:
        risky_call()
    except ValueError as exc:
        raise AppException("validation failed", original=exc) from exc
"""

import traceback

from loguru import logger


def error_details(exc: BaseException) -> str:
    """Return a one-line summary: file, function, line number, and message.

    Walks to the innermost traceback frame so the location points to the
    actual source of the error, not the re-raise site.
    """
    tb = exc.__traceback__
    if tb is not None:
        while tb.tb_next is not None:
            tb = tb.tb_next
        frame = tb.tb_frame
        file_name = frame.f_code.co_filename
        func_name = frame.f_code.co_name
        line_number = tb.tb_lineno
    else:
        file_name = "<unknown>"
        func_name = "<unknown>"
        line_number = -1

    return f"[{file_name}] in {func_name}() at line {line_number}: {exc}"


def format_traceback(exc: BaseException) -> str:
    """Return the full formatted traceback chain as a plain string."""
    return "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))


class AppException(Exception):
    """Project-wide base exception.

    Captures a detailed error message (file, function, line) from an
    optional original exception and exposes a .log() method to emit
    the error through the project logger without repeating boilerplate.

    Usage:
        try:
            load_model()
        except OSError as exc:
            raise AppException("model load failed", original=exc) from exc

    To log without re-raising:
        AppException("config missing").log(level="warning")
    """

    def __init__(self, message: str, original: BaseException | None = None) -> None:
        super().__init__(message)
        self.original = original
        self._detail = error_details(original) if original is not None else message

    def __str__(self) -> str:
        return self._detail

    def log(self, level: str = "error") -> None:
        """Emit this exception through the project logger.

        Args:
            level: loguru level name -- "debug", "info", "warning",
                   "error" (default), or "critical".
        """
        log_fn = getattr(logger.opt(exception=self.original), level)
        log_fn(self._detail)


# ---------------------------------------------------------------------------
# catch -- loguru's built-in safe wrapper, re-exported here for convenience.
#
# Use as a decorator:
#     @catch
#     def risky(): ...
#
#     @catch(reraise=True)          # catches, logs, then re-raises
#     def risky(): ...
#
# Use as a context manager:
#     with catch():
#         risky()
# ---------------------------------------------------------------------------
catch = logger.catch
