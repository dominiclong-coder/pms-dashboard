#!/bin/bash
# Daily data fetch script for PMS Dashboard

cd /Users/dominiclong/Documents/GitHub/pms-dashboard

# Set API token
export API_TOKEN="178fc6cf98cee777e0e60d7f9a895dfba81192d091ad2ff604ab05565ed862e4"

# Run the fetch
/usr/local/bin/npx tsx scripts/fetch-data.ts

# If fetch succeeded, upload to Firebase and then commit/push
if [ $? -eq 0 ]; then
  echo "Fetch succeeded, uploading to Firebase..."
  /usr/local/bin/npx tsx scripts/populate-firebase.ts

  if [ $? -eq 0 ]; then
    echo "Firebase upload succeeded, committing changes..."
    git add public/data/registrations.json
    git commit -m "Daily data refresh $(date '+%Y-%m-%d')"
    git push
    echo "Data updated, uploaded to Firebase, and pushed successfully"
  else
    echo "Firebase upload failed, not pushing to git"
  fi
else
  echo "Fetch failed, not pushing"
fi
