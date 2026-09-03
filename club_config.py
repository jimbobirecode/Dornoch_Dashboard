"""
Club profile configuration for the dashboard
============================================

Mirrors club_config.py in the core API. ONE environment variable switches the
dashboard between customers:

    CLUB_PROFILE=royal_dornoch   (default on this branch - demo customer)
    CLUB_PROFILE=streamsong      (original Streamsong Resort configuration)

The logged-in user's `customer_id` (dashboard_users table) must match the
profile's `club_id`, because bookings are filtered by club.
"""

import os
from typing import Dict

STREAMSONG_PROFILE: Dict = {
    'club_id': 'streamsong',
    'name': 'Streamsong Resort',
    'short_name': 'Streamsong',
    'dashboard_title': 'Streamsong Dashboard',
    'page_title': 'Streamsong Booking Dashboard',
    'timezone': 'America/New_York',
    'currency_symbol': '$',
    'currency_code': 'USD',
    'date_format_long': '%A, %B %d, %Y',    # Wednesday, March 18, 2026
    'date_format_medium': '%B %d, %Y',      # March 18, 2026
    'date_format_short': '%b %d, %Y',       # Mar 18, 2026
    'date_format_day': '%b %d',             # Mar 18
    'datetime_format': '%b %d, %Y %I:%M %p',
    'datetime_compact': '%m/%d %I:%M%p',
    'logo_file': 'assets/ssr-logo-notag.png',        # dark backgrounds (sidebar)
    'logo_file_light': 'assets/ssr-logo-notag.png',  # light backgrounds (login)
    'page_icon': 'assets/ssr-logo-notag.png',
    'export_prefix': 'streamsong',
    'from_name': 'Streamsong Golf Resort',
    'courses': ['Blue Course', 'Red Course', 'Black Course'],
    'default_course': 'Streamsong Resort',
    'lodging': {'type': 'onsite', 'label': 'Lodging', 'has_resort_fee': True},
    'colors': {
        # Booking pages
        'slate_blue': '#3d5266',
        'florida_sky': '#87a7b3',
        'rust_copper': '#a0653f',
        'olive_green': '#6b7c3f',
        'native_grass': '#8b9456',
        'sunset_orange': '#cc8855',
        'off_white': '#f7f5f2',
        'sand_dune': '#d4b896',
        'warm_grey': '#666666',
        'background_dark': '#2a3a4a',
        'card_gradient_start': '#3d5266',
        'card_gradient_end': '#4a6278',
        # Reports & Analytics page (navy/gold palette)
        'report_navy': '#081c3c',
        'report_navy_light': '#0d2847',
        'report_gold': '#997424',
        'report_text': '#fffefe',
        # Login / password screens
        'login_gradient_end': '#5a6f85',
        'login_muted': '#e8e3d9',
    },
    'proshop_items': [
        {'name': 'Streamsong Resort Cap', 'description': 'Premium embroidered cap with Streamsong logo',
         'price': '35', 'image_url': 'https://streamsonggolf.com/images/cap.jpg', 'url': 'https://streamsonggolf.com/proshop/cap'},
        {'name': 'Titleist Pro V1', 'description': 'Dozen premium golf balls - perfect for Streamsong courses',
         'price': '55', 'image_url': 'https://streamsonggolf.com/images/balls.jpg', 'url': 'https://streamsonggolf.com/proshop/balls'},
        {'name': 'Streamsong Performance Polo', 'description': 'Moisture-wicking performance polo with resort logo',
         'price': '85', 'image_url': 'https://streamsonggolf.com/images/polo.jpg', 'url': 'https://streamsonggolf.com/proshop/polo'},
    ],
    'journey_product_price': '$98.00',
}


ROYAL_DORNOCH_PROFILE: Dict = {
    'club_id': 'royal_dornoch',
    'name': 'Royal Dornoch Golf Club',
    'short_name': 'Royal Dornoch',
    'dashboard_title': 'Royal Dornoch Visitor Bookings',
    'page_title': 'Royal Dornoch Booking Dashboard',
    'timezone': 'Europe/London',
    'currency_symbol': '£',
    'currency_code': 'GBP',
    'date_format_long': '%A %d %B %Y',      # Wednesday 18 March 2026
    'date_format_medium': '%d %B %Y',       # 18 March 2026
    'date_format_short': '%d %b %Y',        # 18 Mar 2026
    'date_format_day': '%d %b',             # 18 Mar
    'datetime_format': '%d %b %Y %H:%M',
    'datetime_compact': '%d/%m %H:%M',
    'logo_file': 'assets/royal-dornoch-logo.png',
    'logo_file_light': 'assets/royal-dornoch-logo.png',   # login screen is dark too
    'page_icon': '⛳',
    'export_prefix': 'royal_dornoch',
    'from_name': 'Royal Dornoch Golf Club',
    'courses': ['Championship Course', 'Struie Course'],
    'default_course': 'Championship Course',
    'lodging': {'type': 'partner', 'label': 'Accommodation', 'has_resort_fee': False},
    'colors': {
        # Booking pages - Dornoch green, gorse gold, North Sea blue, links sand
        'slate_blue': '#1d3b2a',           # primary (Dornoch green)
        'florida_sky': '#2f5d7c',          # North Sea blue (Requested badge)
        'rust_copper': '#c9a227',          # gorse gold (accents / hover)
        'olive_green': '#3f7a4f',          # links green (borders / Confirmed)
        'native_grass': '#6e8f5e',         # machair green (Booked)
        'sunset_orange': '#b8862b',        # heather gold (Inquiry)
        'off_white': '#f6f4ee',            # links sand
        'sand_dune': '#d9cfae',            # dune grass
        'warm_grey': '#6b6b6b',
        'background_dark': '#12261b',
        'card_gradient_start': '#1d3b2a',
        'card_gradient_end': '#2a4f3a',
        # Reports & Analytics page
        'report_navy': '#1d3b2a',
        'report_navy_light': '#2a4f3a',
        'report_gold': '#c9a227',
        'report_text': '#fffdf7',
        # Login / password screens
        'login_gradient_end': '#2f5d7c',
        'login_muted': '#e6e0cc',
    },
    'proshop_items': [
        {'name': 'Royal Dornoch Crested Cap', 'description': 'Classic cotton cap with the club crest',
         'price': '30', 'image_url': '', 'url': 'https://royaldornoch.com'},
        {'name': 'Titleist Pro V1 - Dornoch logo', 'description': 'Dozen premium balls with the Royal Dornoch logo',
         'price': '60', 'image_url': '', 'url': 'https://royaldornoch.com'},
        {'name': 'Merino Links Sweater', 'description': 'Windproof merino knit for a Dornoch Firth breeze',
         'price': '120', 'image_url': '', 'url': 'https://royaldornoch.com'},
    ],
    'journey_product_price': '£85.00',
}

PROFILES = {
    'streamsong': STREAMSONG_PROFILE,
    'royal_dornoch': ROYAL_DORNOCH_PROFILE,
    'royaldornoch': ROYAL_DORNOCH_PROFILE,
    'dornoch': ROYAL_DORNOCH_PROFILE,
}

DEFAULT_PROFILE_KEY = 'royal_dornoch'


def get_profile_key() -> str:
    key = (os.getenv('CLUB_PROFILE') or DEFAULT_PROFILE_KEY).strip().lower().replace('-', '_')
    if key not in PROFILES:
        raise ValueError(f"Unknown CLUB_PROFILE '{key}'. Valid options: {', '.join(sorted(set(PROFILES)))}")
    return key


PROFILE: Dict = dict(PROFILES[get_profile_key()])
PROFILE['from_name'] = os.getenv('FROM_NAME', PROFILE['from_name'])

CLUB_ID = PROFILE['club_id']
CURRENCY = PROFILE['currency_symbol']
COLORS = PROFILE['colors']
DATE_FMT_LONG = PROFILE['date_format_long']
DATE_FMT_MEDIUM = PROFILE['date_format_medium']
DATE_FMT_SHORT = PROFILE['date_format_short']
DATE_FMT_DAY = PROFILE['date_format_day']
DATETIME_FMT = PROFILE['datetime_format']
DATETIME_COMPACT = PROFILE['datetime_compact']


# The dashboard's HTML/CSS was written with the Streamsong palette. Every
# st.markdown() call is passed through apply_brand_colors() (see dashboard.py),
# so a new club only needs a colour map here.
_STREAMSONG_COLORS = STREAMSONG_PROFILE['colors']
_COLOR_MAP = {
    _STREAMSONG_COLORS[key]: COLORS[key]
    for key in _STREAMSONG_COLORS
    if key in COLORS and _STREAMSONG_COLORS[key].lower() != COLORS[key].lower()
}


def apply_brand_colors(html: str) -> str:
    """Swap Streamsong-era colour literals for the active club's palette."""
    if not isinstance(html, str) or not _COLOR_MAP:
        return html
    for old, new in _COLOR_MAP.items():
        html = html.replace(old, new).replace(old.upper(), new)
    return html


def money(amount, decimals: int = 2) -> str:
    """money(1292) -> '£1,292.00' (or '$1,292.00' for Streamsong)."""
    try:
        amount = float(amount)
    except (TypeError, ValueError):
        amount = 0.0
    return f"{CURRENCY}{amount:,.{decimals}f}"


def now_local():
    """Naive 'now' in the club's local timezone (hosted servers run on UTC)."""
    from datetime import datetime
    try:
        from zoneinfo import ZoneInfo
        return datetime.now(ZoneInfo(PROFILE['timezone'])).replace(tzinfo=None)
    except Exception:
        return datetime.now()
