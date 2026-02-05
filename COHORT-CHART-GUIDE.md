# Cohort Survival Analysis Chart - User Guide

## Overview
The new Cohort Survival Analysis Chart shows claim rates by purchase cohort over time. This helps you identify if certain purchase cohorts have higher claim rates than others.

## How to Use

### 1. View the Chart
- The chart appears as the third chart on the dashboard (below Claims Over Time)
- Shows a heatmap with:
  - **Rows (Y-axis)**: Purchase month cohorts (e.g., "Jan 2024", "Feb 2024")
  - **Columns (X-axis)**: Months since purchase (0, 1, 2, ..., up to 12 for warranty)
  - **Cell values**: Survival rate percentage (% of buyers who have NOT filed a claim)
  - **Colors**:
    - Green = High survival rate (few claims)
    - Yellow = Moderate
    - Orange/Red = Low survival rate (many claims)

### 2. Enter Purchase Volume Data
Before you can see meaningful data, you need to enter monthly purchase volumes:

1. Click **"Update Purchase Data"** button
2. A modal opens showing a table with:
   - Rows: All months up to the most recent COMPLETE month
   - Columns: "All Products", "Dental Pod Go", "Dental Pod", "Dental Pod Pro", "Zima Go/Zima UV Case/Zima Case Air"
3. Enter the number of units sold for each month/product combination
4. Click **"Save Changes"**

**Important Notes:**
- Data is saved to Firebase and persists across sessions
- You only need to update new months - previous data is retained
- The table only shows complete months (current month is excluded)
- Leave cells blank or enter 0 if no data available

### 3. Filter and Adjust View

**Product Filter:**
- Dropdown showing: All Products, Dental Pod Go, Dental Pod, Dental Pod Pro, Zima Go/Zima UV Case/Zima Case Air
- Shows survival rates for that specific product category
- Product names are automatically grouped (e.g., "Dental Pod Go Arctic White" → "Dental Pod Go")

**Date Range:**
- **From**: Select starting month for cohort analysis
- **To**: Select ending month
- Default shows last 6 complete months
- Only complete months are available (current month excluded)

**Claim Type Toggle:**
- Switch between Warranty and Return claims (uses the main dashboard toggle)
- Warranty: Shows up to 12 months since purchase
- Return: Shows only 0-1 months since purchase (31-day window)

### 4. Read the Heatmap

**Understanding the Values:**
- **95%+** = Excellent (very few claims)
- **90-95%** = Good
- **70-90%** = Fair
- **50-70%** = Poor (many claims)
- **<50%** = Critical (most buyers filed claims)
- **N/A** = No purchase volume data entered for this cohort

**Cumulative Nature:**
- Percentages are CUMULATIVE (can only stay flat or decrease over time)
- Example for a cohort with 100 purchases:
  - Month 0: 2 claims → 98% survival
  - Month 1: 3 more claims (5 total) → 95% survival
  - Month 2: 2 more claims (7 total) → 93% survival

**Hover for Details:**
- Hover over any cell to see:
  - Purchase cohort month
  - Months since purchase
  - Purchase volume
  - Cumulative claim count
  - Exact survival rate and claim rate

## Product Name Matching

The chart automatically groups product variants:
- **Dental Pod Go**: Matches "Dental Pod Go Arctic White", "Dental Pod Go Jet Black", etc.
- **Dental Pod Pro**: Matches "Dental Pod Pro Arctic White", "Dental Pod Pro Sage Green", etc.
- **Dental Pod**: Matches "Dental Pod Arctic White", "Dental Pod (Copy) Rose Pink", etc. (excludes Go/Pro)
- **Zima Go/Zima UV Case/Zima Case Air**: Matches "Zima Go Silver", "Zima UV Case Rose Gold", "Zima Case Air", etc.

## Use Cases

### Identify Problem Cohorts
- Look for red/orange rows (high claim rates)
- Compare if certain purchase months have consistently higher claims
- Example: "Did Q4 2023 buyers have more issues than Q1 2024 buyers?"

### Track Claim Velocity
- Compare claim rates across columns (months since purchase)
- See when most claims occur (month 0? month 3?)
- Example: "Do most warranty claims happen in months 6-9?"

### Product Comparison
- Switch product filter to compare survival rates
- Example: "Does Dental Pod Pro have better survival rates than Dental Pod?"

### Time-to-Failure Analysis
- Identify at what point survival rates drop significantly
- Example: "Survival rate stays above 95% for 6 months, then drops to 85% by month 9"

## Troubleshooting

### "No cohort data available"
- You need to select a date range and add purchase volume data
- Click "Update Purchase Data" and enter monthly volumes

### Cells show "N/A"
- No purchase volume data entered for that cohort/product
- Open the purchase modal and add the missing data

### Chart looks empty
- Check if date range is too narrow
- Check if product filter excludes all data
- Verify purchase volumes are entered for selected date range

### Colors don't make sense
- Remember: GREEN = good (high survival), RED = bad (high claims)
- Values are survival rates (% who DIDN'T claim), not claim rates
- Cumulative values only decrease or stay flat over time

## Firebase Structure

Purchase volumes are stored in Firebase:
```
purchase-volumes/
  └── current/
      ├── volumes[] (array of {yearMonth, product, purchaseCount})
      └── lastUpdated (timestamp)
```

This data persists across sessions and page reloads.

## Tips

1. **Start with "All Products"** to get a high-level view
2. **Enter purchase data in batches** (e.g., quarterly) to save time
3. **Use consistent date ranges** for comparing trends over time
4. **Export/screenshot the heatmap** for reports or presentations
5. **Update purchase data monthly** to keep analysis current

---

Need help? The heatmap tooltip provides detailed info on hover, and the legend shows the color scale for survival rates.
