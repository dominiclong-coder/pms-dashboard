#!/bin/bash
# Daily data fetch script for PMS Dashboard

cd /Users/dominiclong/Documents/GitHub/pms-dashboard

# Set API token
export API_TOKEN="178fc6cf98cee777e0e60d7f9a895dfba81192d091ad2ff604ab05565ed862e4"

# Run the fetch
/usr/local/bin/npx tsx scripts/fetch-data.ts

# If fetch succeeded, commit and push
if [ $? -eq 0 ]; then
  git add public/data/registrations.json
  git commit -m "Daily data refresh $(date '+%Y-%m-%d')"
  git push
  echo "Data updated and pushed successfully"
else
  echo "Fetch failed, not pushing"
fi
