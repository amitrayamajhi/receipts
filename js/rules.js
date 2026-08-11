// Category keyword rules. Edit freely — first matching keyword wins, and longer
// keywords are tried before shorter ones so "ice cream" beats "ice".
// The user's saved overrides (learned in the review form) take priority over these.

export const CATEGORIES = [
  "Groceries", "Household", "Dining", "Transport", "Utilities", "Health",
  "Personal Care", "Clothing", "Entertainment", "Education", "Fees", "Other",
];

export const CATEGORY_RULES = {
  Groceries: [
    "banana", "milk", "laban", "mango", "apple", "bread", "egg", "eggs", "rice",
    "chicken", "meat", "fish", "vegetable", "veg ", "fruit", "water", "juice",
    "sugar", "salt", "flour", "oil", "cheese", "yogurt", "yoghurt", "butter",
    "tomato", "onion", "potato", "cereal", "pasta", "noodle", "biscuit", "chips",
    "chocolate", "coffee", "tea", "dates", "grocery", "supermarket", "lulu",
    "carrefour", "spinney", "union coop", "fresh", "dairy", "snack",
  ],
  Household: [
    "glove", "bag", "cleaner", "detergent", "tissue", "tissues", "soap",
    "dish", "towel", "napkin", "bleach", "sponge", "trash", "garbage",
    "toilet paper", "kitchen", "foil", "battery", "batteries", "bulb", "broom",
    "mop", "air freshener", "hardware",
  ],
  Dining: [
    "restaurant", "cafe", "coffee shop", "burger", "pizza", "shawarma", "meal",
    "combo", "kfc", "mcdonald", "starbucks", "costa", "tim horton", "subway",
    "dine", "biryani", "sandwich", "latte", "cappuccino", "food court", "bakery",
  ],
  Transport: [
    "fuel", "petrol", "gas station", "adnoc", "enoc", "eppco", "diesel",
    "taxi", "uber", "careem", "metro", "salik", "parking", "nol", "bus",
    "toll", "car wash", "tyre", "garage", "rta",
  ],
  Utilities: [
    "dewa", "sewa", "addc", "electricity", "water bill", "internet", "etisalat",
    "du ", "mobile recharge", "recharge", "broadband", "utility", "gas bill",
    "landline", "wifi",
  ],
  Health: [
    "pharmacy", "medicine", "tablet", "capsule", "syrup", "clinic", "hospital",
    "doctor", "dental", "panadol", "vitamin", "supplement", "mask", "sanitizer",
    "bandage", "aspirin", "medical",
  ],
  "Personal Care": [
    "shampoo", "conditioner", "toothpaste", "toothbrush", "deodorant", "razor",
    "shaving", "lotion", "cream", "perfume", "cosmetic", "makeup", "lipstick",
    "salon", "haircut", "barber", "nail", "skincare", "face wash",
  ],
  Clothing: [
    "shirt", "t-shirt", "trouser", "jeans", "dress", "shoe", "shoes", "sandal",
    "sock", "jacket", "abaya", "kandura", "scarf", "cap", "belt", "clothing",
    "apparel", "garment", "footwear",
  ],
  Entertainment: [
    "cinema", "movie", "netflix", "spotify", "game", "gaming", "playstation",
    "xbox", "toy", "theme park", "ticket", "concert", "subscription", "youtube",
    "book store", "amusement",
  ],
  Education: [
    "school", "tuition", "course", "book", "notebook", "pen", "pencil", "stationery",
    "exam", "university", "college", "class", "training", "certificate", "udemy",
  ],
  Fees: [
    "bag charge", "bag fee", "charge", "service charge", "delivery", "delivery fee",
    "fee", "surcharge", "vat", "tax", "tip", "commission", "handling",
  ],
};

// Merchant-name hints: if the store name matches, unmatched items lean this way.
export const MERCHANT_HINTS = [
  { match: /lulu|carrefour|spinney|union\s*coop|grocer|supermarket|hypermarket|baqala|bakala/i, category: "Groceries" },
  { match: /adnoc|enoc|eppco|petrol|fuel/i, category: "Transport" },
  { match: /pharmac|aster|life|medical|clinic|hospital/i, category: "Health" },
  { match: /restaurant|cafe|coffee|kfc|mcdonald|pizza|burger|starbucks|costa/i, category: "Dining" },
  { match: /dewa|sewa|etisalat|\bdu\b|addc/i, category: "Utilities" },
];
