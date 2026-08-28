"""
PayRecover AI - Root Runner
"""
import os
import sys

project_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "razorpay")
sys.path.insert(0, project_dir)
os.chdir(project_dir)

from run import start

if __name__ == "__main__":
    start()
