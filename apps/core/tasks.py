"""
Celery tasks documentation:
https://docs.celeryq.dev/en/stable/userguide/tasks.html
"""

import celery


class BaseTaskWithRetry(celery.Task):
    """
    Automatically retry task in case of failure (up to 3 times). This class
    is intended to be used as a base class for other tasks that need to be
    retried in case of failure.

    Attributes:
        autoretry_for (tuple): The list of exceptions that should be caught and retried.
        retry_kwargs (dict): The maximum number of retries this task can have.
        retry_backoff (int): The time in seconds to wait before retrying the task.
        retry_jitter (bool): Whether to apply exponential backoff when retrying.
    """

    # The list of exceptions that should be caught and retried
    autoretry_for = (Exception, KeyError)

    # The maximum number of retries this task can have
    retry_kwargs = {"max_retries": 3}

    # The time in seconds to wait before retrying the task
    retry_backoff = 5

    # Whether to apply exponential backoff when retrying:
    # When you build a custom retry strategy for your Celery task
    # (which needs to send a request to another service), you should add
    # some randomness to the delay calculation to prevent all tasks from
    # being executed simultaneously resulting in a thundering herd.
    retry_jitter = True
