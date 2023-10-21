from dataclasses import dataclass

import black


@dataclass
class Noodle:
    def print(self, object, line_length=50):
        if isinstance(object, str):
            print(object)
            return

        formatted = black.format_str(
            str(object),
            mode=black.FileMode(line_length=line_length),
        )
        print(formatted)
