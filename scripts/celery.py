from subprocess import check_call


def run_worker():
    check_call(["celery", "-A", "conf", "worker", "--loglevel=info"])


def run_beat():
    check_call(["celery", "-A", "conf", "beat", "--loglevel=info"])
