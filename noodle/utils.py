def create_box(output: str, margen_length=2):
    """
    Creates a box around the given output string with a specified margin length.

    Args:
        output (str): The string to be boxed.
        margen_length (int): The length of the margin. Defaults to 2.

    Returns:
        str: The boxed string.
    """
    margen = " " * margen_length
    box_length = max(output.split("\n"), key=len)

    boxed_output = "\n".join(
        [
            f"{margen}{line}{' ' * (len(box_length) - len(line))}{margen}"
            for line in output.split("\n")
        ]
    )
    return f"\n{boxed_output}\n"
