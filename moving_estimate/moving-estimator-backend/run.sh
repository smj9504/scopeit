#!/bin/bash
# Moving Estimator Pro - Backend Server

# Install dependencies
pip install -r requirements.txt

# Run server
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
