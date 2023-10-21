from dataclasses import dataclass

import black

from .hue import bg, red, green, orange
from .utils import create_box

from .types import BoxTypes


@dataclass
class Noodle:
    def print(self, object, line_length=50):
        """
        Formats and print the given object as a string using Black.

        Args:
            object: The object to be printed.
            line_length (int): The maximum length of each line in the output.

        Returns:
            None
        """
        print(self._output(object, line_length=line_length))

    def block(self, object, line_length=50, margen_length=2, type: BoxTypes = "info"):
        """
        Formats the given object with Black as a block of text with a colored
        background.

        Args:
            object: The object to format.
            line_length (int): The maximum length of each line in the block.
            margen_length (int): The number of spaces to include in the left and
            right margins of the block.

        Returns:
            None
        """
        output = f"\n{self._output(object, line_length=line_length)}"
        final_output = create_box(output, margen_length)
        match type:
            case "info":
                print(bg(final_output))
            case "error":
                print(bg(red(final_output)))
            case "success":
                print(bg(green(final_output)))
            case "warning":
                print(bg(orange(final_output)))
            case _:
                print(final_output)

    def _output(self, object, line_length=50):
        """
        Formats the given object as a string using Black.

        Args:
            object: The object to format as a string.
            line_length: The maximum line length for the formatted string.

        Returns:
            If the object is already a string, returns the object unchanged.
            Otherwise, returns the formatted string representation of the object.
        """
        if isinstance(object, str):
            return object

        return black.format_str(
            str(object),
            mode=black.FileMode(line_length=line_length),
        )
