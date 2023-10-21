from noodle import noodle

dictionary = {
    "string": "string",
    "prefix": "prefix",
    "suffix": "!",
    "sep": " ",
    "end": "\n",
    "file": None,
    "flush": False,
}
test_list = (1, 2, 3, 4, 5, 1, 2, 3)
string = "Hello World!"

noodle.print(dictionary, line_length=50)
noodle.block(dictionary, line_length=50, margen_length=2, type="warning")
