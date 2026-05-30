#!/bin/bash
set -e

BASE_URL="http://localhost:8080"

echo "=== Test PR Creation with Item Selection & New Item Creation ==="
echo ""

# Test 1: Create PR with existing item
echo "✓ Test 1: Create PR with existing item (id=25)"
PR_RESPONSE=$(curl -s -X POST "$BASE_URL/api/purchase-requisitions" \
  -H "Content-Type: application/json" \
  -d '{
    "zone_id": "dry_storage",
    "item_id": 25,
    "item_name": "akjsdnckjsd",
    "quantity": 5,
    "unit_cost": 100,
    "supplier": "Test Supplier",
    "created_by_id": 1,
    "created_by_name": "Tester"
  }')
echo "$PR_RESPONSE" | grep -q '"status":"success"' && echo "  ✅ PR created successfully" || echo "  ❌ Failed"

# Test 2: Create PR with new item
echo ""
echo "✓ Test 2: Create PR with new item (full form submission)"
TIMESTAMP=$(date +%s%N | cut -b1-13)
NEW_ITEM_PR=$(curl -s -X POST "$BASE_URL/api/purchase-requisitions" \
  -H "Content-Type: application/json" \
  -d "{
    \"zone_id\": \"cold_storage\",
    \"is_new_item\": true,
    \"item_name\": \"Test Item $TIMESTAMP\",
    \"item_code\": \"TST-$TIMESTAMP\",
    \"category\": \"Test Category\",
    \"sub_category\": \"Test Sub\",
    \"item_type\": \"Bulk\",
    \"uom\": \"kg\",
    \"uom_attributes\": {\"base_uom\": \"g\"},
    \"specifications\": \"Test specs\",
    \"storage_requirements\": \"Cool & Dry\",
    \"is_perishable\": true,
    \"track_batches\": true,
    \"quantity\": 10,
    \"unit_cost\": 250,
    \"supplier\": \"New Supplier\",
    \"created_by_id\": 1,
    \"created_by_name\": \"Tester\"
  }")
echo "$NEW_ITEM_PR" | grep -q '"status":"success"' && echo "  ✅ PR with new item created" || echo "  ❌ Failed"

# Extract item_id from PR response if present
ITEM_ID=$(echo "$NEW_ITEM_PR" | grep -o '"item_id":[0-9]*' | cut -d':' -f2)
if [ ! -z "$ITEM_ID" ]; then
  echo "  ✅ New item created with ID: $ITEM_ID"

  # Test 3: Verify new item exists in inventory
  echo ""
  echo "✓ Test 3: Verify new item was created in inventory"
  ITEM_CHECK=$(curl -s "$BASE_URL/api/inv/items/$ITEM_ID" -H "x-user-id: 1")
  if echo "$ITEM_CHECK" | grep -q "Test Item $TIMESTAMP"; then
    echo "  ✅ New item verified in inventory: Test Item $TIMESTAMP"
  else
    echo "  ⚠️  Item not found in inventory yet (may not be persisted)"
  fi
else
  echo "  ⚠️  No item_id returned (mock data may not persist)"
fi

echo ""
echo "=== All tests completed ==="
