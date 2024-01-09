from textual.app import App, ComposeResult
from textual.widgets import Header, Footer


class Noodle(App):
    """A REST API client for the terminal."""

    BINDINGS = [("d", "toggle_dark", "Toggle dark modee")]

    def compose(self) -> ComposeResult:
        """Create child widgets for the app."""
        yield Header()
        yield Footer()

    def action_toggle_dark(self) -> None:
        """An action to toggle dark mode."""
        self.dark = not self.dark


def run():
    app = Noodle()
    app.run()


if __name__ == "__main__":
    run()
