def get_errors(e: Exception) -> list:
    """
    Extracts error messages from a ValidationError or similar exception.
    Args:
        e (Exception): The exception to extract errors from.
    Returns:
        list: A list of error messages.
    """
    errors = []

    for err in e.error_list:
        if hasattr(err, "messages"):
            errors.extend(err.messages)
        else:
            errors.append(str(err))

    return errors
