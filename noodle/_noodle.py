from dataclasses import dataclass
import black


@dataclass
class Noodle:
    def print(self, object):
        if isinstance(object, str):
            print(object)
            return

        print(black.format_str(str(object), mode=black.FileMode()))
