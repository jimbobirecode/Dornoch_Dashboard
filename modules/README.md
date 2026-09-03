# Royal Dornoch Dashboard Modules

Modular, reusable components for building booking management dashboards with Streamlit.

## Structure

```
modules/
├── auth/                   # Authentication module
│   ├── __init__.py
│   └── authentication.py   # User auth functions
├── database/               # Database operations
│   ├── __init__.py
│   ├── connection.py       # DB connection utilities
│   └── bookings.py         # Booking CRUD operations
├── ui/                     # UI components
│   ├── __init__.py
│   ├── styles.py           # CSS and styling constants
│   └── components.py       # Reusable UI components
└── utils/                  # Utility functions
    ├── __init__.py
    └── helpers.py          # Helper functions
```

## Installation

```bash
# Install required dependencies
pip install streamlit pandas psycopg bcrypt openpyxl
```

## Usage

### 1. Authentication

```python
from modules.auth import authenticate_user, set_permanent_password

# Authenticate a user
success, customer_id, full_name, must_change, user_id = authenticate_user(username, password)

if success:
    if must_change:
        # Prompt for new password
        set_permanent_password(user_id, new_password)
```

### 2. Database Operations

```python
from modules.database import (
    load_bookings_from_db,
    update_booking_status,
    update_booking_note
)

# Load bookings for a club
df, source = load_bookings_from_db(club_id)

# Update booking status
update_booking_status(booking_id, 'Confirmed', username)

# Update booking notes
update_booking_note(booking_id, "Updated notes text")
```

### 3. UI Styling

```python
import streamlit as st
from modules.ui import ROYAL DORNOCH_COLORS, get_dashboard_css

# Apply Royal Dornoch styling
st.markdown(get_dashboard_css(), unsafe_allow_html=True)

# Use colors in custom components
color = ROYAL DORNOCH_COLORS['olive_green']
```

### 4. Utility Functions

```python
from modules.utils import extract_tee_time_from_note, generate_status_progress_bar

# Extract tee time from email content
tee_time = extract_tee_time_from_note(note_text)

# Generate progress bar HTML
progress_html = generate_status_progress_bar('Confirmed')
st.markdown(progress_html, unsafe_allow_html=True)
```

## Configuration

### Environment Variables

Required environment variables:

```bash
DATABASE_URL=postgresql://user:password@host:port/database
```

### Database Schema

The modules expect the following database tables:

#### `dashboard_users` table:
```sql
CREATE TABLE dashboard_users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT,
    temp_password TEXT,
    customer_id VARCHAR(255),
    full_name VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    must_change_password BOOLEAN DEFAULT FALSE,
    last_login TIMESTAMP
);
```

#### `bookings` table:
```sql
CREATE TABLE bookings (
    id SERIAL PRIMARY KEY,
    booking_id VARCHAR(255) UNIQUE,
    guest_email VARCHAR(255),
    date DATE,
    tee_time VARCHAR(50),
    players INTEGER,
    total DECIMAL(10,2),
    status VARCHAR(50),
    note TEXT,
    club VARCHAR(255),
    timestamp TIMESTAMP DEFAULT NOW(),
    customer_confirmed_at TIMESTAMP,
    updated_at TIMESTAMP,
    updated_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    hotel_required BOOLEAN DEFAULT FALSE,
    hotel_checkin DATE,
    hotel_checkout DATE,
    golf_courses TEXT,
    selected_tee_times TEXT
);
```

## Customization

### Changing Colors

Edit `modules/ui/styles.py` to customize the color palette:

```python
ROYAL DORNOCH_COLORS = {
    'slate_blue': '#3d5266',
    'olive_green': '#6b7c3f',
    # ... add your custom colors
}
```

### Adding New Database Operations

Add new functions to `modules/database/bookings.py`:

```python
def custom_query(param):
    """Your custom database operation"""
    conn = get_db_connection()
    # ... your logic
    return result
```

## Example: Complete Dashboard

```python
import streamlit as st
from modules.auth import authenticate_user
from modules.database import load_bookings_from_db
from modules.ui import get_dashboard_css
from modules.utils import generate_status_progress_bar

# Apply styling
st.set_page_config(page_title="My Dashboard", layout="wide")
st.markdown(get_dashboard_css(), unsafe_allow_html=True)

# Authentication
if not st.session_state.get('authenticated'):
    username = st.text_input("Username")
    password = st.text_input("Password", type="password")

    if st.button("Login"):
        success, customer_id, full_name, _, user_id = authenticate_user(username, password)
        if success:
            st.session_state.authenticated = True
            st.session_state.customer_id = customer_id
            st.rerun()
else:
    # Load and display bookings
    df, _ = load_bookings_from_db(st.session_state.customer_id)

    for _, booking in df.iterrows():
        st.markdown(f"### {booking['booking_id']}")
        progress_html = generate_status_progress_bar(booking['status'])
        st.markdown(progress_html, unsafe_allow_html=True)
```

## License

MIT License - Feel free to use in your projects!

## Contributing

Contributions welcome! Please maintain the modular structure and add tests for new features.
