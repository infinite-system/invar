#!/usr/bin/env python3
"""Show the PTY rows and columns after each window-size signal.

Run `python3 .invar/tasks/in-progress/382-agent-pane-resume-dialog-unreachable/382-pty-window-size-probe.py A`.
Each visible row is `<pane> <row>/<rows> <columns>x<rows> E<event>`.
A complete frame starts at row 1 and ends at the reported row count.
"""

import os
import signal
import sys


class PtyWindowSizeProbe:
    def __init__(self, pane_label: str) -> None:
        self.pane_label = pane_label
        self.resize_event_count = 0

    def run(self) -> None:
        sys.stdout.write("\x1b[?1049h\x1b[?25l")
        sys.stdout.flush()
        signal.signal(signal.SIGWINCH, self.handle_window_change)
        signal.signal(signal.SIGINT, self.stop)
        signal.signal(signal.SIGTERM, self.stop)
        self.draw_frame()
        while True:
            signal.pause()

    def handle_window_change(self, _signal_number: int, _frame: object) -> None:
        self.resize_event_count += 1
        self.draw_frame()

    def draw_frame(self) -> None:
        terminal_size = os.get_terminal_size(sys.stdout.fileno())
        columns = max(1, terminal_size.columns)
        rows = max(1, terminal_size.lines)
        row_number_width = len(str(rows))
        frame_lines = []
        for row_number in range(1, rows + 1):
            label = (
                f"{self.pane_label} {row_number:0{row_number_width}d}/{rows} "
                f"{columns}x{rows} E{self.resize_event_count}"
            )
            frame_lines.append(label[: columns - 1].ljust(columns - 1))
        sys.stdout.write("\x1b[2J\x1b[H" + "\r\n".join(frame_lines))
        sys.stdout.flush()

    def stop(self, _signal_number: int, _frame: object) -> None:
        sys.stdout.write("\x1b[?25h\x1b[?1049l")
        sys.stdout.flush()
        raise SystemExit(0)


PtyWindowSizeProbe(sys.argv[1] if len(sys.argv) > 1 else "A").run()
