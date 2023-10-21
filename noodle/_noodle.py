from dataclasses import dataclass

import black

from noodle.hue import bg


@dataclass
class Noodle:
    def print(self, object, line_length=50):
        print(self._output(object, line_length=line_length))

    def block(self, object, line_length=50, margen_length=2):
        margen = " " * margen_length
        output = f"\n{self._output(object, line_length=line_length)}"
        box_length = max(output.split("\n"), key=len)

        output = "\n".join(
            [
                f"{margen}{line}{' ' * (len(box_length) - len(line))}{margen}"
                for line in output.split("\n")
            ]
        )
        final_output = bg(f"\n{output}\n")
        print(final_output)

    def _output(self, object, line_length=50):
        if isinstance(object, str):
            return object

        return black.format_str(
            str(object),
            mode=black.FileMode(line_length=line_length),
        )
