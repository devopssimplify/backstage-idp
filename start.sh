#!/bin/bash
# Load environment variables from .env file
export $(grep -v '^#' .env | xargs)

# Start Backstage
yarn start
