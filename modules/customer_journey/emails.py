"""
Customer Journey Email System
Automated emails for golf club bookings:
1. Welcome email - 3 days before play
2. Thank you email - 2 days after play
"""

import streamlit as st
import os
import re
from datetime import datetime, timedelta
from sendgrid import SendGridAPIClient
from sendgrid.helpers.mail import Mail
import pandas as pd
from psycopg.rows import dict_row

from ..database.connection import get_db_connection


def extract_tee_time_from_note(note_content):
    """Extract tee time from email/note content"""
    if not note_content or pd.isna(note_content):
        return None

    patterns = [
        r'Time:\s*(\d{1,2}:\d{2}\s*[AaPp][Mm])',
        r'time:\s*(\d{1,2}:\d{2}\s*[AaPp][Mm])',
        r'Tee\s+Time:\s*(\d{1,2}:\d{2}\s*[AaPp][Mm])',
    ]

    for pattern in patterns:
        match = re.search(pattern, str(note_content), re.IGNORECASE)
        if match:
            return match.group(1).strip().upper()

    return None


def extract_tee_time_from_selected_tee_times(selected_tee_times):
    """
    Extract tee time from selected_tee_times field which can be:
    - A JSON string containing {"time": "10:35 AM", ...}
    - A dict object
    - A Go map format string like "map[...time:10:35 AM...]"
    - A simple string time value
    """
    if not selected_tee_times:
        return None

    # If it's already a dict, extract the 'time' key
    if isinstance(selected_tee_times, dict):
        return selected_tee_times.get('time')

    # If it's a string, try multiple parsing strategies
    if isinstance(selected_tee_times, str):
        # Strategy 1: Try parsing as JSON
        try:
            import json
            data = json.loads(selected_tee_times)
            if isinstance(data, dict) and 'time' in data:
                return data['time']
        except (json.JSONDecodeError, ValueError):
            pass

        # Strategy 2: Check if it's a Go map format (map[...time:10:35 AM...])
        # Extract time using regex from format like: map[...time:10:35 AM...]
        map_time_match = re.search(r'time:(\d{1,2}:\d{2}\s*[AaPp][Mm])', selected_tee_times)
        if map_time_match:
            return map_time_match.group(1).strip()

        # Strategy 3: If it's already just the time string
        # Check if it looks like a time (e.g., "10:35 AM")
        if re.match(r'\d{1,2}:\d{2}\s*[AaPp][Mm]', selected_tee_times):
            return selected_tee_times

    return None


# ============================================================================
# CONFIGURATION
# ============================================================================

SENDGRID_API_KEY = os.environ.get('SENDGRID_API_KEY')
FROM_EMAIL = os.environ.get('FROM_EMAIL')
FROM_NAME = os.environ.get('FROM_NAME', 'Royal Dornoch Golf Club')
TEMPLATE_PRE_ARRIVAL = os.environ.get('SENDGRID_TEMPLATE_PRE_ARRIVAL')
TEMPLATE_POST_PLAY = os.environ.get('SENDGRID_TEMPLATE_POST_PLAY')

# Which club's bookings this dashboard manages (matches bookings.club)
CLUB_ID = os.environ.get('CLUB_ID', 'dornoch')

# Currency - Royal Dornoch prices in pounds sterling
CURRENCY_SYMBOL = os.environ.get('CURRENCY_SYMBOL', '\u00a3')


# ============================================================================
# DATABASE FUNCTIONS
# ============================================================================

def get_upcoming_bookings(days_ahead=3, show_all=False):
    """Get bookings N days from now that need welcome emails

    Args:
        days_ahead: Number of days ahead to look (default: 3)
        show_all: If True, show ALL upcoming confirmed bookings
    """
    conn = get_db_connection()
    cursor = conn.cursor(row_factory=dict_row)

    if not show_all:
        target_date = (datetime.now() + timedelta(days=days_ahead)).date()
    else:
        target_date = None

    # Check if email tracking columns exist
    cursor.execute("""
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'bookings'
        AND column_name IN ('pre_arrival_email_sent_at', 'post_play_email_sent_at')
    """)
    existing_cols = [row['column_name'] for row in cursor.fetchall()]
    has_email_tracking = 'pre_arrival_email_sent_at' in existing_cols

    # Build the WHERE clause based on show_all
    if show_all:
        where_clause = "WHERE club = %s AND status = 'Confirmed' AND date >= CURRENT_DATE"
        params = (CLUB_ID,)
    else:
        where_clause = "WHERE club = %s AND status = 'Confirmed' AND date = %s"
        params = (CLUB_ID, target_date)

    # Note: We fetch 'note' field which contains email content with tee time info
    if has_email_tracking:
        cursor.execute(f"""
            SELECT
                id,
                booking_id,
                guest_email,
                guest_name,
                date as play_date,
                tee_time,
                players,
                total,
                golf_courses,
                selected_tee_times,
                note,
                hotel_required,
                hotel_checkin,
                hotel_checkout,
                lodging_nights,
                lodging_rooms,
                lodging_room_type,
                lodging_cost,
                resort_fee_per_person,
                resort_fee_total,
                pre_arrival_email_sent_at
            FROM bookings
            {where_clause}
            ORDER BY date, tee_time
        """, params)
    else:
        cursor.execute(f"""
            SELECT
                id,
                booking_id,
                guest_email,
                guest_name,
                date as play_date,
                tee_time,
                players,
                total,
                golf_courses,
                selected_tee_times,
                note,
                hotel_required,
                hotel_checkin,
                hotel_checkout,
                lodging_nights,
                lodging_rooms,
                lodging_room_type,
                lodging_cost,
                resort_fee_per_person,
                resort_fee_total,
                NULL as pre_arrival_email_sent_at
            FROM bookings
            {where_clause}
            ORDER BY date, tee_time
        """, params)

    bookings = cursor.fetchall()
    cursor.close()
    conn.close()

    return bookings


def get_recent_bookings(days_ago=2, show_all=False):
    """Get bookings from N days ago that need thank you emails

    Args:
        days_ago: Number of days ago to look (default: 2)
        show_all: If True, show ALL recent confirmed bookings (last 30 days)
    """
    conn = get_db_connection()
    cursor = conn.cursor(row_factory=dict_row)

    if not show_all:
        target_date = (datetime.now() - timedelta(days=days_ago)).date()
    else:
        target_date = None

    # Check if email tracking columns exist
    cursor.execute("""
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'bookings'
        AND column_name IN ('pre_arrival_email_sent_at', 'post_play_email_sent_at')
    """)
    existing_cols = [row['column_name'] for row in cursor.fetchall()]
    has_email_tracking = 'post_play_email_sent_at' in existing_cols

    # Build the WHERE clause based on show_all
    if show_all:
        where_clause = "WHERE club = %s AND status = 'Confirmed' AND date >= CURRENT_DATE - INTERVAL '30 days'"
        params = (CLUB_ID,)
    else:
        where_clause = "WHERE club = %s AND status = 'Confirmed' AND date = %s"
        params = (CLUB_ID, target_date)

    if has_email_tracking:
        cursor.execute(f"""
            SELECT
                id,
                booking_id,
                guest_email,
                guest_name,
                date as play_date,
                tee_time,
                players,
                total,
                golf_courses,
                selected_tee_times,
                note,
                hotel_required,
                hotel_checkin,
                hotel_checkout,
                lodging_nights,
                lodging_rooms,
                lodging_room_type,
                lodging_cost,
                resort_fee_per_person,
                resort_fee_total,
                post_play_email_sent_at
            FROM bookings
            {where_clause}
            ORDER BY date DESC, guest_email
        """, params)
    else:
        cursor.execute(f"""
            SELECT
                id,
                booking_id,
                guest_email,
                guest_name,
                date as play_date,
                tee_time,
                players,
                total,
                golf_courses,
                selected_tee_times,
                note,
                hotel_required,
                hotel_checkin,
                hotel_checkout,
                lodging_nights,
                lodging_rooms,
                lodging_room_type,
                lodging_cost,
                resort_fee_per_person,
                resort_fee_total,
                NULL as post_play_email_sent_at
            FROM bookings
            {where_clause}
            ORDER BY date DESC, guest_email
        """, params)

    bookings = cursor.fetchall()
    cursor.close()
    conn.close()

    return bookings


def mark_email_sent(booking_id, email_type):
    """Mark email as sent in database"""
    conn = get_db_connection()
    cursor = conn.cursor()

    # Check if email tracking columns exist
    cursor.execute("""
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'bookings'
        AND column_name IN ('pre_arrival_email_sent_at', 'post_play_email_sent_at')
    """)
    existing_cols = [row[0] for row in cursor.fetchall()]

    try:
        if email_type == 'pre_arrival' and 'pre_arrival_email_sent_at' in existing_cols:
            cursor.execute("""
                UPDATE bookings
                SET pre_arrival_email_sent_at = CURRENT_TIMESTAMP
                WHERE booking_id = %s
            """, (booking_id,))
        elif email_type == 'post_play' and 'post_play_email_sent_at' in existing_cols:
            cursor.execute("""
                UPDATE bookings
                SET post_play_email_sent_at = CURRENT_TIMESTAMP
                WHERE booking_id = %s
            """, (booking_id,))
        else:
            # Column doesn't exist - migration not run yet
            st.warning("⚠️ Email tracking columns not found. Please run the database migration first.")

        conn.commit()
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        cursor.close()
        conn.close()


# ============================================================================
# EMAIL FUNCTIONS
# ============================================================================

def get_proshop_items():
    """
    Return proshop items to feature in emails
    CUSTOMIZE THIS with your actual products and pricing
    """
    return [
        {
            'name': 'Royal Dornoch Golf Club Cap',
            'description': 'Premium embroidered cap with Royal Dornoch logo',
            'price': '35',
            'image_url': 'https://dornochgolf.com/images/cap.jpg',
            'url': 'https://dornochgolf.com/proshop/cap'
        },
        {
            'name': 'Titleist Pro V1',
            'description': 'Dozen premium golf balls - perfect for Royal Dornoch courses',
            'price': '55',
            'image_url': 'https://dornochgolf.com/images/balls.jpg',
            'url': 'https://dornochgolf.com/proshop/balls'
        },
        {
            'name': 'Royal Dornoch Performance Polo',
            'description': 'Moisture-wicking performance polo with resort logo',
            'price': '85',
            'image_url': 'https://dornochgolf.com/images/polo.jpg',
            'url': 'https://dornochgolf.com/proshop/polo'
        }
    ]


def send_welcome_email(booking):
    """Send welcome email 3 days before play"""
    try:
        # DEBUG: Show raw tee_time value from database
        import streamlit as st
        tee_time_raw = booking.get('tee_time')
        selected_tee_times_raw = booking.get('selected_tee_times')
        note_raw = booking.get('note')
        st.info(f"🔍 DEBUG - Raw tee_time from DB: {repr(tee_time_raw)}")
        st.info(f"🔍 DEBUG - Raw selected_tee_times from DB: {repr(selected_tee_times_raw)}")

        # Extract tee time from various sources
        extracted_from_selected = extract_tee_time_from_selected_tee_times(selected_tee_times_raw)
        extracted_from_note = extract_tee_time_from_note(note_raw) if note_raw else None
        st.info(f"🔍 DEBUG - Tee time extracted from selected_tee_times: {repr(extracted_from_selected)}")
        st.info(f"🔍 DEBUG - Tee time extracted from note: {repr(extracted_from_note)}")

        # Check if SendGrid is configured
        if not SENDGRID_API_KEY or not FROM_EMAIL or not TEMPLATE_PRE_ARRIVAL:
            return False, "SendGrid not configured. Please set SENDGRID_API_KEY, FROM_EMAIL, and SENDGRID_TEMPLATE_PRE_ARRIVAL environment variables."

        # Validate required fields before sending
        if not booking.get('booking_id'):
            return False, "❌ Missing booking_id"
        if not booking.get('guest_email'):
            return False, "❌ Missing guest_email"
        if not booking.get('play_date'):
            return False, "❌ Missing play_date"

        guest_name = booking.get('guest_name') or booking['guest_email'].split('@')[0].title()

        # Format the play date nicely
        play_date = booking['play_date']
        if hasattr(play_date, 'strftime'):
            formatted_date = play_date.strftime('%A, %B %d, %Y')
        else:
            formatted_date = str(play_date)

        # Format hotel dates if present
        hotel_checkin_formatted = ''
        hotel_checkout_formatted = ''
        if booking.get('hotel_checkin'):
            if hasattr(booking['hotel_checkin'], 'strftime'):
                hotel_checkin_formatted = booking['hotel_checkin'].strftime('%A, %B %d, %Y')
            else:
                hotel_checkin_formatted = str(booking['hotel_checkin'])
        if booking.get('hotel_checkout'):
            if hasattr(booking['hotel_checkout'], 'strftime'):
                hotel_checkout_formatted = booking['hotel_checkout'].strftime('%A, %B %d, %Y')
            else:
                hotel_checkout_formatted = str(booking['hotel_checkout'])

        # === REQUIRED FIELDS - Match your SendGrid template exactly ===
        # Try multiple sources for tee time:
        # 1. tee_time column (if it's a simple string)
        # 2. Extract from selected_tee_times JSON (e.g., {"time": "10:35 AM"})
        # 3. Extract from note field using regex
        # 4. Default to 'TBD'
        tee_time_value = booking.get('tee_time') or extracted_from_selected or extracted_from_note or 'TBD'
        st.info(f"🔍 DEBUG - Final tee time being sent to SendGrid: {repr(tee_time_value)}")

        dynamic_data = {
            # Your template uses these exact field names:
            'guest_name': guest_name,
            'booking_date': formatted_date,               # Template: {{booking_date}}
            'course_name': booking.get('golf_courses') or 'Royal Dornoch Golf Club',  # Template: {{course_name}}
            'tee_time': tee_time_value,  # Template: {{tee_time}}
            'player_count': str(booking.get('players', 0)),  # Template: {{player_count}}
            'booking_reference': booking['booking_id'],    # Template: {{booking_reference}}
            'product_price': f'{CURRENCY_SYMBOL}98.00',                     # Template: {{product_price}}
            'current_year': str(datetime.now().year),     # Template: {{current_year}}

            # Backward compatibility (keep these for old templates)
            'date': formatted_date,
            'course': booking.get('golf_courses') or 'Royal Dornoch Golf Club',
            'players': str(booking.get('players', 0)),
            'booking_ref': booking['booking_id'],
            'play_date': formatted_date,

            # Additional details
            'total': f"{CURRENCY_SYMBOL}{booking.get('total', 0):.2f}" if booking.get('total') else f'{CURRENCY_SYMBOL}0.00',
            'club_email': FROM_EMAIL,
            'proshop_items': get_proshop_items(),

            # Hotel information
            'hotel_required': 'Yes' if booking.get('hotel_required') else 'No',
            'hotel_checkin': hotel_checkin_formatted,
            'hotel_checkout': hotel_checkout_formatted,
            'lodging_nights': str(booking.get('lodging_nights') or 0),
            'lodging_rooms': str(booking.get('lodging_rooms') or 0),
            'lodging_room_type': booking.get('lodging_room_type') or '',
            'lodging_cost': f"{CURRENCY_SYMBOL}{booking.get('lodging_cost', 0):.2f}" if booking.get('lodging_cost') else '',
            'resort_fee_per_person': f"{CURRENCY_SYMBOL}{booking.get('resort_fee_per_person', 0):.2f}" if booking.get('resort_fee_per_person') else '',
            'resort_fee_total': f"{CURRENCY_SYMBOL}{booking.get('resort_fee_total', 0):.2f}" if booking.get('resort_fee_total') else '',
        }

        st.info(f"🔍 DEBUG - Full dynamic_data keys: {list(dynamic_data.keys())}")

        message = Mail(
            from_email=(FROM_EMAIL, FROM_NAME),
            to_emails=booking['guest_email']
        )
        message.template_id = TEMPLATE_PRE_ARRIVAL
        message.dynamic_template_data = dynamic_data

        sg = SendGridAPIClient(SENDGRID_API_KEY)
        response = sg.send(message)

        if response.status_code in [200, 202]:
            mark_email_sent(booking['booking_id'], 'pre_arrival')
            return True, "Email sent successfully!"
        else:
            return False, f"SendGrid error: {response.status_code}"

    except Exception as e:
        return False, f"Error: {str(e)}"


def send_thank_you_email(booking):
    """Send thank you email 2 days after play"""
    try:
        # DEBUG: Show raw tee_time value from database
        import streamlit as st
        tee_time_raw = booking.get('tee_time')
        selected_tee_times_raw = booking.get('selected_tee_times')
        note_raw = booking.get('note')
        st.info(f"🔍 DEBUG - Raw tee_time from DB: {repr(tee_time_raw)}")
        st.info(f"🔍 DEBUG - Raw selected_tee_times from DB: {repr(selected_tee_times_raw)}")

        # Extract tee time from various sources
        extracted_from_selected = extract_tee_time_from_selected_tee_times(selected_tee_times_raw)
        extracted_from_note = extract_tee_time_from_note(note_raw) if note_raw else None
        st.info(f"🔍 DEBUG - Tee time extracted from selected_tee_times: {repr(extracted_from_selected)}")
        st.info(f"🔍 DEBUG - Tee time extracted from note: {repr(extracted_from_note)}")

        # Check if SendGrid is configured
        if not SENDGRID_API_KEY or not FROM_EMAIL or not TEMPLATE_POST_PLAY:
            return False, "SendGrid not configured. Please set SENDGRID_API_KEY, FROM_EMAIL, and SENDGRID_TEMPLATE_POST_PLAY environment variables."

        # Validate required fields before sending
        if not booking.get('booking_id'):
            return False, "❌ Missing booking_id"
        if not booking.get('guest_email'):
            return False, "❌ Missing guest_email"
        if not booking.get('play_date'):
            return False, "❌ Missing play_date"

        guest_name = booking.get('guest_name') or booking['guest_email'].split('@')[0].title()

        # Format the play date nicely
        play_date = booking['play_date']
        if hasattr(play_date, 'strftime'):
            formatted_date = play_date.strftime('%A, %B %d, %Y')
        else:
            formatted_date = str(play_date)

        # Format hotel dates if present
        hotel_checkin_formatted = ''
        hotel_checkout_formatted = ''
        if booking.get('hotel_checkin'):
            if hasattr(booking['hotel_checkin'], 'strftime'):
                hotel_checkin_formatted = booking['hotel_checkin'].strftime('%A, %B %d, %Y')
            else:
                hotel_checkin_formatted = str(booking['hotel_checkin'])
        if booking.get('hotel_checkout'):
            if hasattr(booking['hotel_checkout'], 'strftime'):
                hotel_checkout_formatted = booking['hotel_checkout'].strftime('%A, %B %d, %Y')
            else:
                hotel_checkout_formatted = str(booking['hotel_checkout'])

        # === REQUIRED FIELDS - Match your SendGrid template exactly ===
        # Try multiple sources for tee time:
        # 1. tee_time column (if it's a simple string)
        # 2. Extract from selected_tee_times JSON (e.g., {"time": "10:35 AM"})
        # 3. Extract from note field using regex
        # 4. Default to 'TBD'
        tee_time_value = booking.get('tee_time') or extracted_from_selected or extracted_from_note or 'TBD'
        st.info(f"🔍 DEBUG - Final tee time being sent to SendGrid: {repr(tee_time_value)}")

        dynamic_data = {
            # Your template uses these exact field names:
            'guest_name': guest_name,
            'booking_date': formatted_date,               # Template: {{booking_date}}
            'course_name': booking.get('golf_courses') or 'Royal Dornoch Golf Club',  # Template: {{course_name}}
            'tee_time': tee_time_value,  # Template: {{tee_time}}
            'player_count': str(booking.get('players', 0)),  # Template: {{player_count}}
            'booking_reference': booking['booking_id'],    # Template: {{booking_reference}}
            'product_price': f'{CURRENCY_SYMBOL}98.00',                     # Template: {{product_price}}
            'current_year': str(datetime.now().year),     # Template: {{current_year}}

            # Backward compatibility (keep these for old templates)
            'date': formatted_date,
            'course': booking.get('golf_courses') or 'Royal Dornoch Golf Club',
            'players': str(booking.get('players', 0)),
            'booking_ref': booking['booking_id'],
            'play_date': formatted_date,

            # Additional details
            'total': f"{CURRENCY_SYMBOL}{booking.get('total', 0):.2f}" if booking.get('total') else f'{CURRENCY_SYMBOL}0.00',
            'club_email': FROM_EMAIL,
            'proshop_items': get_proshop_items(),

            # Hotel information
            'hotel_required': 'Yes' if booking.get('hotel_required') else 'No',
            'hotel_checkin': hotel_checkin_formatted,
            'hotel_checkout': hotel_checkout_formatted,
            'lodging_nights': str(booking.get('lodging_nights') or 0),
            'lodging_rooms': str(booking.get('lodging_rooms') or 0),
            'lodging_room_type': booking.get('lodging_room_type') or '',
            'lodging_cost': f"{CURRENCY_SYMBOL}{booking.get('lodging_cost', 0):.2f}" if booking.get('lodging_cost') else '',
            'resort_fee_per_person': f"{CURRENCY_SYMBOL}{booking.get('resort_fee_per_person', 0):.2f}" if booking.get('resort_fee_per_person') else '',
            'resort_fee_total': f"{CURRENCY_SYMBOL}{booking.get('resort_fee_total', 0):.2f}" if booking.get('resort_fee_total') else '',
        }

        st.info(f"🔍 DEBUG - Full dynamic_data keys: {list(dynamic_data.keys())}")

        message = Mail(
            from_email=(FROM_EMAIL, FROM_NAME),
            to_emails=booking['guest_email']
        )
        message.template_id = TEMPLATE_POST_PLAY
        message.dynamic_template_data = dynamic_data

        sg = SendGridAPIClient(SENDGRID_API_KEY)
        response = sg.send(message)

        if response.status_code in [200, 202]:
            mark_email_sent(booking['booking_id'], 'post_play')
            return True, "Email sent successfully!"
        else:
            return False, f"SendGrid error: {response.status_code}"

    except Exception as e:
        return False, f"Error: {str(e)}"


# ============================================================================
# STREAMLIT UI
# ============================================================================

def render_customer_journey_page():
    """Main function - renders the customer journey emails page"""

    st.title("📧 Customer Journey Emails")
    st.markdown("Manage welcome and thank you emails for your guests")

    # Create tabs
    tab1, tab2, tab3 = st.tabs([
        "📅 Upcoming Welcome Emails",
        "✅ Recent Thank You Emails",
        "📊 Analytics"
    ])

    # ========================================================================
    # TAB 1: WELCOME EMAILS (3 days before)
    # ========================================================================
    with tab1:
        st.subheader("Welcome Emails - Send 3 Days Before Play")

        # Add checkbox to show all bookings
        show_all_upcoming = st.checkbox("📋 Show all upcoming bookings (send immediately)", key="show_all_upcoming")

        bookings = get_upcoming_bookings(days_ahead=3, show_all=show_all_upcoming)

        if not bookings:
            if show_all_upcoming:
                st.info("No upcoming confirmed bookings found")
            else:
                target_date = (datetime.now() + timedelta(days=3)).date()
                st.info(f"No bookings scheduled for {target_date.strftime('%B %d, %Y')} (3 days from now)")
        else:
            if show_all_upcoming:
                st.success(f"**{len(bookings)} upcoming bookings** (send immediately to any)")
            else:
                target_date = bookings[0]['play_date']
                st.success(f"**{len(bookings)} bookings** scheduled for {target_date.strftime('%B %d, %Y')}")

            # Display each booking
            for booking in bookings:
                col1, col2, col3 = st.columns([3, 2, 2])

                with col1:
                    st.markdown(f"**{booking['guest_email']}**")
                    date_str = booking['play_date'].strftime('%b %d') if hasattr(booking['play_date'], 'strftime') else str(booking['play_date'])
                    st.caption(f"📅 {date_str} • 🕐 {booking.get('tee_time', 'TBD')} • {booking['players']} players")

                with col2:
                    if booking['pre_arrival_email_sent_at']:
                        st.success(f"✅ Sent {booking['pre_arrival_email_sent_at'].strftime('%b %d, %I:%M %p')}")
                    else:
                        st.warning("⏳ Not sent yet")

                with col3:
                    button_label = "Resend" if booking['pre_arrival_email_sent_at'] else "Send Welcome Email"
                    if st.button(button_label, key=f"welcome_{booking['booking_id']}"):
                        with st.spinner("Sending..."):
                            success, message = send_welcome_email(booking)
                            if success:
                                st.success(message)
                                st.rerun()
                            else:
                                st.error(message)

                st.divider()

            # Bulk send button
            unsent = [b for b in bookings if not b['pre_arrival_email_sent_at']]
            if unsent:
                st.markdown("---")
                if st.button(f"📨 Send All ({len(unsent)} emails)", type="primary", key="bulk_welcome"):
                    progress = st.progress(0)
                    status = st.empty()

                    sent_count = 0
                    for i, booking in enumerate(unsent):
                        status.text(f"Sending to {booking['guest_email']}...")
                        success, _ = send_welcome_email(booking)
                        if success:
                            sent_count += 1
                        progress.progress((i + 1) / len(unsent))

                    status.text("")
                    progress.empty()
                    st.success(f"✅ Sent {sent_count}/{len(unsent)} emails")
                    st.rerun()

    # ========================================================================
    # TAB 2: THANK YOU EMAILS (2 days after)
    # ========================================================================
    with tab2:
        st.subheader("Thank You Emails - Send 2 Days After Play")

        # Add checkbox to show all bookings
        show_all_recent = st.checkbox("📋 Show all recent bookings (last 30 days, send immediately)", key="show_all_recent")

        bookings = get_recent_bookings(days_ago=2, show_all=show_all_recent)

        if not bookings:
            if show_all_recent:
                st.info("No recent confirmed bookings found (last 30 days)")
            else:
                target_date = (datetime.now() - timedelta(days=2)).date()
                st.info(f"No bookings from {target_date.strftime('%B %d, %Y')} (2 days ago)")
        else:
            if show_all_recent:
                st.success(f"**{len(bookings)} recent bookings** (last 30 days - send immediately to any)")
            else:
                target_date = bookings[0]['play_date']
                st.success(f"**{len(bookings)} guests** played on {target_date.strftime('%B %d, %Y')}")

            for booking in bookings:
                col1, col2, col3 = st.columns([3, 2, 2])

                with col1:
                    st.markdown(f"**{booking['guest_email']}**")
                    st.caption(f"Played on {booking['play_date'].strftime('%b %d, %Y')}")

                with col2:
                    if booking['post_play_email_sent_at']:
                        st.success(f"✅ Sent {booking['post_play_email_sent_at'].strftime('%b %d, %I:%M %p')}")
                    else:
                        st.warning("⏳ Not sent yet")

                with col3:
                    button_label = "Resend" if booking['post_play_email_sent_at'] else "Send Thank You"
                    if st.button(button_label, key=f"thanks_{booking['booking_id']}"):
                        with st.spinner("Sending..."):
                            success, message = send_thank_you_email(booking)
                            if success:
                                st.success(message)
                                st.rerun()
                            else:
                                st.error(message)

                st.divider()

            # Bulk send
            unsent = [b for b in bookings if not b['post_play_email_sent_at']]
            if unsent:
                st.markdown("---")
                if st.button(f"📨 Send All ({len(unsent)} emails)", type="primary", key="bulk_thanks"):
                    progress = st.progress(0)
                    status = st.empty()

                    sent_count = 0
                    for i, booking in enumerate(unsent):
                        status.text(f"Sending to {booking['guest_email']}...")
                        success, _ = send_thank_you_email(booking)
                        if success:
                            sent_count += 1
                        progress.progress((i + 1) / len(unsent))

                    status.text("")
                    progress.empty()
                    st.success(f"✅ Sent {sent_count}/{len(unsent)} emails")
                    st.rerun()

    # ========================================================================
    # TAB 3: ANALYTICS
    # ========================================================================
    with tab3:
        st.subheader("📊 Email Analytics")

        conn = get_db_connection()
        cursor = conn.cursor(row_factory=dict_row)

        # Check if email tracking columns exist
        cursor.execute("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'bookings'
            AND column_name IN ('pre_arrival_email_sent_at', 'post_play_email_sent_at')
        """)
        existing_cols = [row['column_name'] for row in cursor.fetchall()]
        has_email_tracking = len(existing_cols) > 0

        if not has_email_tracking:
            st.warning("⚠️ Email tracking columns not found. Please run the database migration first:")
            st.code("psql $DATABASE_URL < migration_add_journey_emails.sql")
            cursor.close()
            conn.close()
            return

        # Get 30-day stats
        cursor.execute("""
            SELECT
                COUNT(*) FILTER (WHERE pre_arrival_email_sent_at IS NOT NULL) as welcome_sent,
                COUNT(*) FILTER (WHERE post_play_email_sent_at IS NOT NULL) as thanks_sent,
                COUNT(*) as total_bookings
            FROM bookings
            WHERE status = 'Confirmed'
            AND date >= CURRENT_DATE - INTERVAL '30 days'
        """)

        stats = cursor.fetchone()

        col1, col2, col3 = st.columns(3)

        with col1:
            st.metric("Total Bookings (30d)", stats['total_bookings'])

        with col2:
            st.metric("Welcome Emails Sent", stats['welcome_sent'])
            if stats['total_bookings'] > 0:
                pct = (stats['welcome_sent'] / stats['total_bookings']) * 100
                st.caption(f"{pct:.0f}% coverage")

        with col3:
            st.metric("Thank You Emails Sent", stats['thanks_sent'])
            if stats['total_bookings'] > 0:
                pct = (stats['thanks_sent'] / stats['total_bookings']) * 100
                st.caption(f"{pct:.0f}% coverage")

        st.markdown("---")

        # Recent activity
        cursor.execute("""
            SELECT
                guest_email,
                date as play_date,
                pre_arrival_email_sent_at,
                post_play_email_sent_at
            FROM bookings
            WHERE (pre_arrival_email_sent_at IS NOT NULL OR post_play_email_sent_at IS NOT NULL)
            AND date >= CURRENT_DATE - INTERVAL '14 days'
            ORDER BY date DESC
            LIMIT 50
        """)

        recent = cursor.fetchall()
        cursor.close()
        conn.close()

        if recent:
            st.markdown("### 📅 Recent Email Activity")
            df = pd.DataFrame(recent)
            df['play_date'] = pd.to_datetime(df['play_date']).dt.strftime('%Y-%m-%d')

            # Handle None values in timestamp columns
            df['pre_arrival_email_sent_at'] = df['pre_arrival_email_sent_at'].apply(
                lambda x: x.strftime('%m/%d %I:%M%p') if pd.notna(x) else '-'
            )
            df['post_play_email_sent_at'] = df['post_play_email_sent_at'].apply(
                lambda x: x.strftime('%m/%d %I:%M%p') if pd.notna(x) else '-'
            )

            st.dataframe(df, use_container_width=True, hide_index=True)
