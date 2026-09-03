import streamlit as st
import pandas as pd
from datetime import datetime, timedelta
from io import BytesIO
import html
import json
import os
import re

# ----------------------------------------------------------------------------
# Branding / locale
# ----------------------------------------------------------------------------
CLUB_ID = os.environ.get('CLUB_ID', 'dornoch')
CLUB_NAME = os.environ.get('CLUB_NAME', 'Royal Dornoch Golf Club')
CURRENCY_SYMBOL = os.environ.get('CURRENCY_SYMBOL', '\u00a3')

# Club logo. Drop the file in at this path; until it exists the dashboard
# falls back to the club name as a text wordmark rather than erroring.
LOGO_PATH = os.environ.get('LOGO_PATH', 'assets/dornoch-logo.png')
LOGO_AVAILABLE = os.path.exists(LOGO_PATH)


def render_logo(**kwargs):
    """Render the club logo, or a text wordmark when the asset is missing."""
    if LOGO_AVAILABLE:
        st.image(LOGO_PATH, **kwargs)
    else:
        st.markdown(
            "<div style='text-align: center; font-family: Georgia, serif; "
            "color: #F6F3EC; font-size: 1.25rem; font-weight: 700; "
            "letter-spacing: 1px; text-transform: uppercase; padding: 0.5rem 0;'>"
            f"{CLUB_NAME}</div>",
            unsafe_allow_html=True,
        )

# Import modular components
from modules.auth import (
    authenticate_user,
    set_permanent_password,
    update_last_login
)
from modules.database import (
    load_bookings_from_db,
    update_booking_status,
    update_booking_note,
    delete_booking,
    update_booking_tee_time,
    fix_all_tee_times
)
from modules.ui import get_dashboard_css
from modules.utils import (
    extract_tee_time_from_note,
    get_status_icon,
    get_status_color,
    generate_status_progress_bar
)
from modules.notify import (
    prepare_booking_data_for_export,
    export_to_json,
    export_to_api_format,
    push_to_notify_api,
    export_notify_csv
)
from modules.waitlist import (
    load_waitlist_from_db,
    add_to_waitlist,
    update_waitlist_status,
    delete_waitlist_entry,
    convert_waitlist_to_booking
)
from modules.analytics import (
    calculate_lead_times,
    calculate_customer_inquiry_frequency,
    calculate_golf_course_popularity,
    identify_marketing_segments
)
from modules.customer_journey import (
    render_customer_journey_page
)


# ========================================
# SESSION STATE
# ========================================
if 'authenticated' not in st.session_state:
    st.session_state.authenticated = False
if 'customer_id' not in st.session_state:
    st.session_state.customer_id = None
if 'username' not in st.session_state:
    st.session_state.username = None
if 'full_name' not in st.session_state:
    st.session_state.full_name = None
if 'user_id' not in st.session_state:
    st.session_state.user_id = None
if 'must_change_password' not in st.session_state:
    st.session_state.must_change_password = False
if 'show_password_change' not in st.session_state:
    st.session_state.show_password_change = False


# ========================================
# LOGOUT FUNCTION
# ========================================
def logout():
    st.session_state.authenticated = False
    st.session_state.customer_id = None
    st.session_state.username = None
    st.session_state.full_name = None
    st.session_state.user_id = None
    st.session_state.must_change_password = False
    st.session_state.show_password_change = False


# ========================================
# STREAMLIT PAGE CONFIG
# ========================================
st.set_page_config(
    page_title="Royal Dornoch Booking Dashboard",
    page_icon=LOGO_PATH if LOGO_AVAILABLE else "\u26f3",
    layout="wide",
    initial_sidebar_state="expanded"
)

# ========================================
# STYLING - ROYAL DORNOCH BRAND
# ========================================
st.markdown(get_dashboard_css(), unsafe_allow_html=True)


# ========================================
# PASSWORD CHANGE SCREEN
# ========================================
if st.session_state.show_password_change:
    st.markdown("""
        <style>
        .password-container {
            max-width: 500px;
            margin: 100px auto;
            padding: 2.5rem;
            background: linear-gradient(135deg, #2B4048 0%, #5a6f85 100%);
            border-radius: 16px;
            border: 1px solid rgba(107, 124, 63, 0.3);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
        }
        .password-title {
            color: #F6F3EC;
            font-size: 1.8rem;
            font-weight: 700;
            text-align: center;
            margin-bottom: 0.5rem;
        }
        .password-subtitle {
            color: #e8e3d9;
            text-align: center;
            margin-bottom: 2rem;
            font-size: 0.95rem;
        }
        </style>
    """, unsafe_allow_html=True)

    st.markdown("""
        <div class="password-container">
            <div class="password-title">Set Your Password</div>
            <div class="password-subtitle">First-time setup - create your secure password</div>
        </div>
    """, unsafe_allow_html=True)

    with st.form("password_setup_form"):
        st.info(f"Welcome, **{st.session_state.full_name}**! Please create a secure password for your account.")

        new_password = st.text_input("New Password", type="password", key="new_pass")
        confirm_password = st.text_input("Confirm Password", type="password", key="confirm_pass")

        col1, col2 = st.columns([1, 1])
        with col1:
            submit = st.form_submit_button("Set Password", use_container_width=True)
        with col2:
            cancel = st.form_submit_button("Cancel", use_container_width=True)

        if cancel:
            logout()
            st.rerun()

        if submit:
            if not new_password or not confirm_password:
                st.error("Please fill in both password fields")
            elif new_password != confirm_password:
                st.error("Passwords do not match")
            elif len(new_password) < 8:
                st.error("Password must be at least 8 characters")
            else:
                if set_permanent_password(st.session_state.user_id, new_password):
                    update_last_login(st.session_state.user_id)
                    st.session_state.show_password_change = False
                    st.session_state.must_change_password = False
                    st.success("Password set successfully!")
                    st.rerun()
                else:
                    st.error("Error setting password. Please try again.")
    
    st.stop()


# ========================================
# LOGIN SCREEN
# ========================================
if not st.session_state.authenticated:
    st.markdown("""
        <style>
        .login-logo-container {
            text-align: center;
            margin-top: 80px;
            margin-bottom: 2rem;
        }
        .login-subtitle {
            color: #E0D5BE;
            text-align: center;
            margin-bottom: 3rem;
            font-size: 1.1rem;
            font-weight: 500;
        }
        </style>
    """, unsafe_allow_html=True)

    # Center the logo with reduced size
    col1, col2, col3 = st.columns([1, 1, 1])
    with col2:
        st.markdown("<div class='login-logo-container'>", unsafe_allow_html=True)
        render_logo(use_column_width=True)
        st.markdown("</div>", unsafe_allow_html=True)

    st.markdown("""
        <div class="login-subtitle">Booking Management System</div>
    """, unsafe_allow_html=True)
    
    with st.form("login_form"):
        username = st.text_input("Username", key="login_username")
        password = st.text_input("Password", type="password", key="login_password")
        submit = st.form_submit_button("Login", use_container_width=True)
        
        if submit:
            if username and password:
                success, customer_id, full_name, must_change, user_id = authenticate_user(username, password)
                
                if success:
                    st.session_state.authenticated = True
                    st.session_state.customer_id = customer_id
                    st.session_state.username = username
                    st.session_state.full_name = full_name
                    st.session_state.user_id = user_id
                    
                    if must_change:
                        st.session_state.must_change_password = True
                        st.session_state.show_password_change = True
                        st.success("Please set your password...")
                        st.rerun()
                    else:
                        update_last_login(user_id)
                        st.success("Login successful!")
                        st.rerun()
                else:
                    st.error("Invalid username or password")
            else:
                st.error("Please enter username and password")
    
    st.markdown("""
        <div style='text-align: center; color: #6b7280; font-size: 0.85rem; margin-top: 2rem;'>
            <p>First time? Use your temporary password</p>
        </div>
    """, unsafe_allow_html=True)
    
    st.stop()


# ========================================
# MAIN DASHBOARD
# ========================================

with st.sidebar:
    # Small logo in sidebar - stacked vertically
    render_logo(use_column_width=True)
    st.markdown("""
        <div style='text-align: center; margin-top: 0.5rem;'>
            <p style='color: #e8e3d9; font-size: 0.9rem; margin: 0; font-weight: 600; letter-spacing: 0.5px;'>Booking Dashboard</p>
        </div>
    """, unsafe_allow_html=True)

    st.markdown("<div style='height: 1px; background: #6B7F4E; margin: 1rem 0 1.5rem 0;'></div>", unsafe_allow_html=True)

    st.markdown(f"<div class='user-badge'>{st.session_state.full_name}</div>", unsafe_allow_html=True)
    st.markdown(f"<div class='club-badge'>{st.session_state.customer_id.title()}</div>", unsafe_allow_html=True)

    st.markdown("<div style='height: 1px; background: #6B7F4E; margin: 1.5rem 0;'></div>", unsafe_allow_html=True)

    if st.button("Logout", use_container_width=True):
        logout()
        st.rerun()

    st.markdown("<div style='height: 1px; background: #6B7F4E; margin: 1.5rem 0;'></div>", unsafe_allow_html=True)

    # Navigation
    if 'current_page' not in st.session_state:
        st.session_state.current_page = "Bookings"

    nav_options = ["Bookings", "Waitlist", "Reports & Analytics", "Marketing Segmentation", "Notify Integration", "Customer Journey Emails"]

    st.radio(
        "Select View",
        nav_options,
        key="current_page",
        label_visibility="collapsed"
    )

    # Get the current page from session state
    page = st.session_state.current_page

    st.markdown("<div style='height: 1px; background: #6B7F4E; margin: 1.5rem 0;'></div>", unsafe_allow_html=True)

    st.markdown("#### Filters")

    # Initialize filter state
    if 'auto_include_status' not in st.session_state:
        st.session_state.auto_include_status = set()
    if 'clicked_status_filter' not in st.session_state:
        st.session_state.clicked_status_filter = None
    if 'date_filter_preset' not in st.session_state:
        st.session_state.date_filter_preset = "Next 30 Days"

    # Date preset selector
    date_preset = st.selectbox(
        "Date Preset",
        ["Today", "Next 7 Days", "Next 30 Days", "Next 60 Days", "Next 90 Days", "All Upcoming", "Custom"],
        index=2  # Default to "Next 30 Days"
    )

    # Calculate date range based on preset
    if date_preset == "Today":
        date_range = (datetime.now().date(), datetime.now().date())
    elif date_preset == "Next 7 Days":
        date_range = (datetime.now().date(), datetime.now().date() + timedelta(days=7))
    elif date_preset == "Next 30 Days":
        date_range = (datetime.now().date(), datetime.now().date() + timedelta(days=30))
    elif date_preset == "Next 60 Days":
        date_range = (datetime.now().date(), datetime.now().date() + timedelta(days=60))
    elif date_preset == "Next 90 Days":
        date_range = (datetime.now().date(), datetime.now().date() + timedelta(days=90))
    elif date_preset == "All Upcoming":
        date_range = (datetime.now().date(), datetime.now().date() + timedelta(days=365))
    else:  # Custom
        date_range = st.date_input(
            "Custom Date Range",
            value=(datetime.now().date(), datetime.now().date() + timedelta(days=30))
        )

    # Status filter - if clicked from metric card, use that
    if st.session_state.clicked_status_filter:
        default_statuses = [st.session_state.clicked_status_filter]
    else:
        # Merge default statuses with auto-included ones
        default_statuses = ["Inquiry", "Requested", "Confirmed", "Booked", "Pending"]
        default_statuses = list(set(default_statuses) | st.session_state.auto_include_status)

    status_filter = st.multiselect(
        "Status",
        ["Inquiry", "Requested", "Confirmed", "Booked", "Rejected", "Cancelled", "Pending"],
        default=default_statuses
    )

    # Hotel requirement filter
    hotel_filter = st.selectbox(
        "Hotel Requirement",
        ["All", "Hotel Required", "No Hotel"],
        index=0
    )

    # Clear filter button
    if st.button("Clear All Filters", use_container_width=True):
        st.session_state.clicked_status_filter = None
        st.cache_data.clear()
        st.rerun()

st.markdown("""
    <h1 style='margin-bottom: 1rem;'>Royal Dornoch Dashboard</h1>
""", unsafe_allow_html=True)

# Render page based on navigation selection
if page == "Bookings":
    # Header with refresh button
    header_col1, header_col2 = st.columns([4, 1])
    with header_col1:
        st.markdown("""
            <h2 style='margin-bottom: 0.5rem;'>Booking Requests</h2>
            <p style='color: #E0D5BE; margin-bottom: 1rem; font-size: 0.9375rem;'>Manage and track all incoming tee time requests</p>
        """, unsafe_allow_html=True)
    with header_col2:
        if st.button("🔄 Refresh", key="refresh_bookings", use_container_width=True, help="Refresh booking data"):
            st.cache_data.clear()
            st.rerun()

    # Search by booking ref or name
    search_col1, search_col2 = st.columns([3, 1])
    with search_col1:
        search_query = st.text_input(
            "Search",
            placeholder="Search by booking reference, guest name, or email...",
            key="booking_search",
            label_visibility="collapsed"
        )
    with search_col2:
        if st.button("Clear Search", key="clear_search", use_container_width=True):
            st.session_state.booking_search = ""
            st.rerun()

    # Show active filter indicator
    if st.session_state.clicked_status_filter:
        st.markdown(f"""
            <div style='background: #2B4048; border: 2px solid #6B7F4E; border-radius: 8px; padding: 0.75rem 1rem; margin-bottom: 1.5rem; display: flex; align-items: center; justify-content: space-between;'>
                <div style='display: flex; align-items: center; gap: 0.5rem;'>
                    <span style='color: #6B7F4E; font-weight: 600; font-size: 1rem;'>Filtering by: {st.session_state.clicked_status_filter}</span>
                </div>
            </div>
        """, unsafe_allow_html=True)
    else:
        st.markdown("<div style='margin-bottom: 1rem;'></div>", unsafe_allow_html=True)

    df, source = load_bookings_from_db(st.session_state.customer_id)

    if df.empty:
        st.info("No bookings found")
        st.stop()

    filtered_df = df.copy()
    if status_filter:
        filtered_df = filtered_df[filtered_df['status'].isin(status_filter)]

    # Handle date range filtering
    if date_range:
        if isinstance(date_range, tuple) and len(date_range) == 2:
            start_date, end_date = date_range
            filtered_df = filtered_df[
                (filtered_df['date'].dt.date >= start_date) &
                (filtered_df['date'].dt.date <= end_date)
            ]
        elif hasattr(date_range, '__len__') and len(date_range) == 2:
            start_date, end_date = date_range[0], date_range[1]
            filtered_df = filtered_df[
                (filtered_df['date'].dt.date >= start_date) &
                (filtered_df['date'].dt.date <= end_date)
            ]

    # Handle hotel requirement filtering
    if hotel_filter == "Hotel Required":
        filtered_df = filtered_df[filtered_df['hotel_required'] == True]
    elif hotel_filter == "No Hotel":
        filtered_df = filtered_df[filtered_df['hotel_required'] == False]

    # Handle search filtering
    if search_query:
        search_lower = search_query.lower().strip()
        search_mask = (
            filtered_df['booking_id'].astype(str).str.lower().str.contains(search_lower, na=False) |
            filtered_df['guest_email'].astype(str).str.lower().str.contains(search_lower, na=False)
        )
        # Also search in guest_name if column exists
        if 'guest_name' in filtered_df.columns:
            search_mask = search_mask | filtered_df['guest_name'].astype(str).str.lower().str.contains(search_lower, na=False)
        # Also search in note field for additional context
        if 'note' in filtered_df.columns:
            search_mask = search_mask | filtered_df['note'].astype(str).str.lower().str.contains(search_lower, na=False)
        filtered_df = filtered_df[search_mask]

    col1, col2, col3, col4 = st.columns(4)

    # Calculate counts for all statuses (before filtering)
    all_inquiry_count = len(df[df['status'].isin(['Inquiry', 'Pending'])])
    all_requested_count = len(df[df['status'] == 'Requested'])
    all_confirmed_count = len(df[df['status'] == 'Confirmed'])
    all_booked_count = len(df[df['status'] == 'Booked'])

    with col1:
        inquiry_count = len(filtered_df[filtered_df['status'].isin(['Inquiry', 'Pending'])])
        if st.button(f"Inquiry\n{all_inquiry_count}", key="filter_inquiry", use_container_width=True, help="Click to filter Inquiry status"):
            st.session_state.clicked_status_filter = "Inquiry"
            st.cache_data.clear()
            st.rerun()
        st.markdown(f"<div style='text-align: center; color: #E0D5BE; font-size: 0.75rem; margin-top: -0.5rem;'>Showing: {inquiry_count}</div>", unsafe_allow_html=True)
    
    with col2:
        requested_count = len(filtered_df[filtered_df['status'] == 'Requested'])
        if st.button(f"Requested\n{all_requested_count}", key="filter_requested", use_container_width=True, help="Click to filter Requested status"):
            st.session_state.clicked_status_filter = "Requested"
            st.cache_data.clear()
            st.rerun()
        st.markdown(f"<div style='text-align: center; color: #E0D5BE; font-size: 0.75rem; margin-top: -0.5rem;'>Showing: {requested_count}</div>", unsafe_allow_html=True)
    
    with col3:
        confirmed_count = len(filtered_df[filtered_df['status'] == 'Confirmed'])
        if st.button(f"Confirmed\n{all_confirmed_count}", key="filter_confirmed", use_container_width=True, help="Click to filter Confirmed status"):
            st.session_state.clicked_status_filter = "Confirmed"
            st.cache_data.clear()
            st.rerun()
        st.markdown(f"<div style='text-align: center; color: #E0D5BE; font-size: 0.75rem; margin-top: -0.5rem;'>Showing: {confirmed_count}</div>", unsafe_allow_html=True)
    
    with col4:
        booked_count = len(filtered_df[filtered_df['status'] == 'Booked'])
        if st.button(f"Booked\n{all_booked_count}", key="filter_booked", use_container_width=True, help="Click to filter Booked status"):
            st.session_state.clicked_status_filter = "Booked"
            st.cache_data.clear()
            st.rerun()
        st.markdown(f"<div style='text-align: center; color: #E0D5BE; font-size: 0.75rem; margin-top: -0.5rem;'>Showing: {booked_count}</div>", unsafe_allow_html=True)
    
    st.markdown("<div style='height: 2px; background: #6B7F4E; margin: 2rem 0;'></div>", unsafe_allow_html=True)
    
    # Format date range string
    if date_range:
        if isinstance(date_range, tuple) and len(date_range) == 2:
            date_str = f"{date_range[0].strftime('%b %d')} to {date_range[1].strftime('%b %d, %Y')}"
        elif hasattr(date_range, '__len__') and len(date_range) == 2:
            date_str = f"{date_range[0].strftime('%b %d')} to {date_range[1].strftime('%b %d, %Y')}"
        else:
            date_str = "all dates"
    else:
        date_str = "all dates"
    
    st.markdown(f"""
        <div style='margin-bottom: 1.5rem;'>
            <h3 style='color: #f9fafb; font-weight: 600; font-size: 1.125rem;'>{len(filtered_df)} Active Requests</h3>
            <p style='color: #64748b; font-size: 0.875rem; margin-top: 0.25rem;'>Showing bookings from {date_str}</p>
        </div>
    """, unsafe_allow_html=True)
    
    # ========================================
    # BOOKING CARDS - ENHANCED VERSION
    # ========================================
    for idx, booking in filtered_df.iterrows():
        status_icon = get_status_icon(booking['status'])
        status_class = get_status_color(booking['status'])
    
        tee_time_display = booking.get('tee_time', 'Not Specified')
        if tee_time_display == 'None' or tee_time_display is None or pd.isna(tee_time_display):
            tee_time_display = 'Not Specified'
    
        note_content = booking.get('note', '')
        if note_content is None or pd.isna(note_content) or str(note_content).strip() == '':
            note_content = 'No additional information provided'

        # Strip whitespace and ensure we have actual content
        note_content = str(note_content).strip()
        if not note_content:
            note_content = 'No additional information provided'
    
        # Prepare progress bar data
        current_status = booking['status']
        if current_status == 'Pending':
            current_status = 'Inquiry'
    
        stages = [
            {'name': 'Inquiry', 'color': '#4C7A93'},
            {'name': 'Requested', 'color': '#E8B31C'},
            {'name': 'Confirmed', 'color': '#C6A96A'},
            {'name': 'Booked', 'color': '#6B7F4E'}
        ]
    
        is_rejected = current_status == 'Rejected'
        is_cancelled = current_status == 'Cancelled'
        current_index = next((i for i, s in enumerate(stages) if s['name'] == current_status), 0)
        progress_width = (current_index / (len(stages) - 1)) * 100 if len(stages) > 1 else 0
    
        # Format requested time
        requested_time = booking['timestamp'].strftime('%b %d • %I:%M %p')
    
        with st.container():
            # Build progress bar HTML inline
            if is_rejected or is_cancelled:
                status_color = '#6B7F4E' if is_rejected else '#8E8C85'
                progress_html = f"<div style='background: #2B4048; padding: 1rem; border-radius: 8px; border: 2px solid #6B7F4E;'><div style='display: flex; align-items: center; justify-content: center; gap: 0.75rem;'><div style='width: 12px; height: 12px; border-radius: 50%; background: {status_color};'></div><span style='color: {status_color}; font-weight: 700; font-size: 1rem; text-transform: uppercase; letter-spacing: 0.5px;'>{current_status}</span></div></div>"
            else:
                # Build stage nodes HTML
                stages_html = ""
                for i, stage in enumerate(stages):
                    is_active = i <= current_index
                    is_current = i == current_index
                    bg_color = stage['color'] if is_active else '#4C7A93'
                    text_color = '#F6F3EC' if is_active else '#999999'
                    border_color = stage['color'] if is_current else ('#6B7F4E' if is_active else '#4C7A93')
                    box_shadow = '0 0 0 4px rgba(107, 124, 63, 0.4)' if is_current else 'none'
                    font_weight = '700' if is_current else '600'
    
                    stages_html += f"<div style='display: flex; flex-direction: column; align-items: center; z-index: 3; position: relative;'><div style='width: 1.5rem; height: 1.5rem; border-radius: 50%; background: {bg_color}; border: 3px solid {border_color}; box-shadow: {box_shadow}; transition: all 0.3s ease;'></div><div style='margin-top: 0.5rem; font-size: 0.7rem; font-weight: {font_weight}; color: {text_color}; text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap;'>{stage['name']}</div></div>"
    
                progress_html = f"<div style='background: #2B4048; padding: 1.25rem; border-radius: 8px; border: 2px solid #6B7F4E;'><div style='display: flex; align-items: center; justify-content: space-between; position: relative;'><div style='position: absolute; top: 0.75rem; left: 2rem; right: 2rem; height: 3px; background: #4C7A93; z-index: 1;'></div><div style='position: absolute; top: 0.75rem; left: 2rem; width: calc({progress_width}% - 2rem); height: 3px; background: linear-gradient(90deg, #4C7A93, #6B7F4E); z-index: 2;'></div>{stages_html}</div></div>"
    
            # Hotel requirement badge and compact details
            hotel_required = booking.get('hotel_required', False)
            hotel_badge = ""
            hotel_details_html = ""

            if hotel_required:
                hotel_badge = "<div style='display: inline-block; background: #E8B31C; color: #ffffff; padding: 0.4rem 0.8rem; border-radius: 6px; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-left: 0.5rem;'>Hotel Required</div>"

                # Format hotel dates and info
                hotel_checkin = booking.get('hotel_checkin')
                hotel_checkout = booking.get('hotel_checkout')
                lodging_nights = booking.get('lodging_nights')
                lodging_rooms = booking.get('lodging_rooms')
                lodging_room_type = booking.get('lodging_room_type')
                lodging_preferences = booking.get('lodging_preferences')
                lodging_cost = booking.get('lodging_cost')

                if hotel_checkin and not pd.isna(hotel_checkin):
                    checkin_str = hotel_checkin.strftime('%b %d')
                else:
                    checkin_str = "TBD"

                if hotel_checkout and not pd.isna(hotel_checkout):
                    checkout_str = hotel_checkout.strftime('%b %d')
                else:
                    checkout_str = "TBD"

                # Build compact hotel details in a single row
                hotel_cols = []

                # Dates column
                hotel_cols.append(f"<div><div class='data-label' style='margin-bottom: 0.5rem;'>CHECK-IN/OUT</div><div style='font-size: 0.9rem; font-weight: 600; color: #F6F3EC;'>{checkin_str} - {checkout_str}</div></div>")

                # Nights/Rooms column
                nights_rooms = []
                if lodging_nights and not pd.isna(lodging_nights):
                    nights_rooms.append(f"{int(lodging_nights)}N")
                if lodging_rooms and not pd.isna(lodging_rooms):
                    nights_rooms.append(f"{int(lodging_rooms)}R")
                if nights_rooms:
                    hotel_cols.append(f"<div><div class='data-label' style='margin-bottom: 0.5rem;'>NIGHTS/ROOMS</div><div style='font-size: 0.9rem; font-weight: 600; color: #F6F3EC;'>{' • '.join(nights_rooms)}</div></div>")

                # Room type column
                if lodging_room_type and not pd.isna(lodging_room_type) and str(lodging_room_type).strip():
                    room_type_display = str(lodging_room_type).replace('_', ' ').title()
                    hotel_cols.append(f"<div><div class='data-label' style='margin-bottom: 0.5rem;'>ROOM TYPE</div><div style='font-size: 0.9rem; font-weight: 600; color: #F6F3EC;'>{html.escape(room_type_display)}</div></div>")

                # Lodging cost column
                if lodging_cost and not pd.isna(lodging_cost) and float(lodging_cost) > 0:
                    hotel_cols.append(f"<div><div class='data-label' style='margin-bottom: 0.5rem;'>LODGING COST</div><div style='font-size: 1.25rem; font-weight: 700; color: #E8B31C;'>{CURRENCY_SYMBOL}{float(lodging_cost):,.2f}</div></div>")

                # Build the grid
                num_cols = len(hotel_cols)
                if num_cols > 0:
                    hotel_grid = f"<div style='display: grid; grid-template-columns: repeat({num_cols}, 1fr); gap: 1.5rem; margin-bottom: 0.5rem;'>{''.join(hotel_cols)}</div>"

                    # Add special requests if any
                    prefs_section = ""
                    if lodging_preferences and not pd.isna(lodging_preferences) and str(lodging_preferences).strip():
                        prefs_list = str(lodging_preferences).split(';')
                        prefs_text = " • ".join([html.escape(pref.strip()) for pref in prefs_list if pref.strip()])
                        prefs_section = f"<div style='margin-top: 0.5rem; padding-top: 0.75rem; border-top: 1px solid rgba(107, 124, 63, 0.2);'><div class='data-label' style='margin-bottom: 0.25rem;'>SPECIAL REQUESTS</div><div style='font-size: 0.85rem; color: #E0D5BE; line-height: 1.4;'>{prefs_text}</div></div>"

                    hotel_details_html = f"<div style='margin-top: 1rem; padding-top: 1rem; border-top: 1px solid rgba(107, 124, 63, 0.3);'><div style='color: #E8B31C; font-weight: 700; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.75rem;'>🏨 LODGING</div>{hotel_grid}{prefs_section}</div>"

            # Parse and display selected_tee_times in the existing blue section
            selected_tee_times = booking.get('selected_tee_times', None)
            tee_times_section_html = ""

            # Only show detailed tee times for status "Requested" or later
            show_tee_times = current_status in ['Requested', 'Confirmed', 'Booked']

            # Check if we have valid tee times data
            # Note: PostgreSQL returns JSONB as already-parsed list/dict objects
            has_tee_times = (
                selected_tee_times is not None and
                isinstance(selected_tee_times, list) and
                len(selected_tee_times) > 0
            )

            if show_tee_times and has_tee_times:
                try:
                    # Build tee times display - replacing the basic blue section
                    tee_times_rows = ""
                    total_golf_cost = 0.0

                    for i, tee_time in enumerate(selected_tee_times):
                        # Extract data from each tee time entry
                        round_date = tee_time.get('date', booking['date'].strftime('%b %d, %Y'))
                        round_time = tee_time.get('time', tee_time_display)
                        round_course = tee_time.get('course_name', '')
                        round_players = tee_time.get('players', booking['players'])
                        # Try both 'total_cost' and 'price' field names
                        round_cost_per_player = tee_time.get('total_cost') or tee_time.get('price')

                        # Calculate cost display - multiply by number of players for group total
                        if round_cost_per_player is not None and round_cost_per_player > 0:
                            round_total = float(round_cost_per_player) * int(round_players)
                            cost_display = f"{CURRENCY_SYMBOL}{round_total:,.2f}"
                            total_golf_cost += round_total
                        elif len(selected_tee_times) == 1:
                            # Single round - use booking total
                            cost_display = f"{CURRENCY_SYMBOL}{float(booking['total']):,.2f}"
                            total_golf_cost = float(booking['total'])
                        else:
                            # Multi-round - divide total evenly
                            per_round = float(booking['total']) / len(selected_tee_times)
                            cost_display = f"{CURRENCY_SYMBOL}{per_round:,.2f}"
                            total_golf_cost += per_round

                        # Round header (only for multi-round bookings)
                        round_header = ""
                        if len(selected_tee_times) > 1:
                            round_header = f"<div style='grid-column: 1 / -1; color: #6B7F4E; font-weight: 700; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid rgba(107, 124, 63, 0.3);'>⛳ Round {i + 1}</div>"

                        # Build columns
                        cols = []
                        cols.append(f"<div><div class='data-label' style='margin-bottom: 0.5rem;'>TEE DATE</div><div style='font-size: 1rem; font-weight: 600; color: #F6F3EC;'>{html.escape(str(round_date))}</div></div>")
                        cols.append(f"<div><div class='data-label' style='margin-bottom: 0.5rem;'>TEE TIME</div><div style='font-size: 1rem; font-weight: 600; color: #F6F3EC;'>{html.escape(str(round_time))}</div></div>")

                        if round_course:
                            cols.append(f"<div><div class='data-label' style='margin-bottom: 0.5rem;'>COURSE</div><div style='font-size: 1rem; font-weight: 600; color: #F6F3EC;'>{html.escape(str(round_course))}</div></div>")

                        cols.append(f"<div><div class='data-label' style='margin-bottom: 0.5rem;'>PLAYERS</div><div style='font-size: 1rem; font-weight: 600; color: #F6F3EC;'>{int(round_players)}</div></div>")
                        cols.append(f"<div><div class='data-label' style='margin-bottom: 0.5rem;'>ROUND COST</div><div style='font-size: 1.5rem; font-weight: 700; color: #6B7F4E;'>{cost_display}</div></div>")

                        # Build grid
                        grid_template = f"repeat({len(cols)}, 1fr)"
                        margin = "0.5rem" if i < len(selected_tee_times) - 1 else "1rem"
                        tee_times_rows += f"{round_header}<div style='display: grid; grid-template-columns: {grid_template}; gap: 1.5rem; margin-bottom: {margin};'>{''.join(cols)}</div>"

                    # Add summary totals
                    lodging_cost = booking.get('lodging_cost', None)

                    # Calculate resort fees
                    resort_fee_total = 0.0
                    resort_fee_per_person = booking.get('resort_fee_per_person', None)

                    # If resort_fee_per_person is set in booking, calculate total based on players and nights
                    if resort_fee_per_person and not pd.isna(resort_fee_per_person) and float(resort_fee_per_person) > 0:
                        lodging_nights = booking.get('lodging_nights', None)
                        if lodging_nights and not pd.isna(lodging_nights) and int(lodging_nights) > 0:
                            # Resort fee = per person × players × nights
                            resort_fee_total = float(resort_fee_per_person) * int(booking['players']) * int(lodging_nights)
                        else:
                            # If no lodging nights specified, assume 1 night per round
                            num_nights = len(selected_tee_times) if len(selected_tee_times) > 0 else 1
                            resort_fee_total = float(resort_fee_per_person) * int(booking['players']) * num_nights

                    # Check if there's a pre-calculated resort_fee_total in the booking
                    booking_resort_fee_total = booking.get('resort_fee_total', None)
                    if booking_resort_fee_total and not pd.isna(booking_resort_fee_total) and float(booking_resort_fee_total) > 0:
                        resort_fee_total = float(booking_resort_fee_total)

                    summary_cols = []
                    summary_cols.append(f"<div><div class='data-label' style='margin-bottom: 0.5rem;'>TOTAL GOLF COST</div><div style='font-size: 1.5rem; font-weight: 700; color: #6B7F4E;'>{CURRENCY_SYMBOL}{total_golf_cost:,.2f}</div></div>")

                    if lodging_cost and not pd.isna(lodging_cost) and float(lodging_cost) > 0:
                        summary_cols.append(f"<div><div class='data-label' style='margin-bottom: 0.5rem;'>TOTAL LODGING COST</div><div style='font-size: 1.5rem; font-weight: 700; color: #E8B31C;'>{CURRENCY_SYMBOL}{float(lodging_cost):,.2f}</div></div>")
                        grand_total = total_golf_cost + float(lodging_cost)
                    else:
                        grand_total = total_golf_cost

                    # Add resort fees to summary if applicable
                    if resort_fee_total > 0:
                        summary_cols.append(f"<div><div class='data-label' style='margin-bottom: 0.5rem;'>RESORT FEES</div><div style='font-size: 1.5rem; font-weight: 700; color: #4C7A93;'>{CURRENCY_SYMBOL}{resort_fee_total:,.2f}</div></div>")
                        grand_total += resort_fee_total

                    summary_cols.append(f"<div><div class='data-label' style='margin-bottom: 0.5rem;'>GRAND TOTAL</div><div style='font-size: 1.75rem; font-weight: 700; color: #F6F3EC;'>{CURRENCY_SYMBOL}{grand_total:,.2f}</div></div>")

                    summary_grid = f"repeat({len(summary_cols)}, 1fr)"
                    summary_html = f"<div style='margin-top: 1rem; padding-top: 1rem; border-top: 2px solid #6B7F4E;'><div style='display: grid; grid-template-columns: {summary_grid}; gap: 1.5rem;'>{''.join(summary_cols)}</div></div>"

                    tee_times_section_html = tee_times_rows + summary_html

                except Exception as e:
                    # Fallback to basic display on any error
                    tee_times_section_html = f"<div style='display: grid; grid-template-columns: repeat(4, 1fr); gap: 1.5rem; margin-bottom: 1rem;'><div><div class='data-label' style='margin-bottom: 0.5rem;'>TEE DATE</div><div style='font-size: 1rem; font-weight: 600; color: #F6F3EC;'>{booking['date'].strftime('%b %d, %Y')}</div></div><div><div class='data-label' style='margin-bottom: 0.5rem;'>TEE TIME</div><div style='font-size: 1rem; font-weight: 600; color: #F6F3EC;'>{tee_time_display}</div></div><div><div class='data-label' style='margin-bottom: 0.5rem;'>PLAYERS</div><div style='font-size: 1rem; font-weight: 600; color: #F6F3EC;'>{booking['players']}</div></div><div><div class='data-label' style='margin-bottom: 0.5rem;'>TOTAL</div><div style='font-size: 1.5rem; font-weight: 700; color: #6B7F4E;'>{CURRENCY_SYMBOL}{float(booking['total']):,.2f}</div></div></div>"
            else:
                # Basic display for non-Requested status or no tee times data
                tee_times_section_html = f"<div style='display: grid; grid-template-columns: repeat(4, 1fr); gap: 1.5rem; margin-bottom: 1rem;'><div><div class='data-label' style='margin-bottom: 0.5rem;'>TEE DATE</div><div style='font-size: 1rem; font-weight: 600; color: #F6F3EC;'>{booking['date'].strftime('%b %d, %Y')}</div></div><div><div class='data-label' style='margin-bottom: 0.5rem;'>TEE TIME</div><div style='font-size: 1rem; font-weight: 600; color: #F6F3EC;'>{tee_time_display}</div></div><div><div class='data-label' style='margin-bottom: 0.5rem;'>PLAYERS</div><div style='font-size: 1rem; font-weight: 600; color: #F6F3EC;'>{booking['players']}</div></div><div><div class='data-label' style='margin-bottom: 0.5rem;'>TOTAL</div><div style='font-size: 1.5rem; font-weight: 700; color: #6B7F4E;'>{CURRENCY_SYMBOL}{booking['total']:,.2f}</div></div></div>"

            # Escape and format note content for display
            note_display = html.escape(note_content).replace('\n', '<br>')

            # Build complete card HTML (without notes - notes will be in expander below)
            card_html = f"<div class='booking-card' style='background: linear-gradient(135deg, #2B4048 0%, #4C7A93 100%); border: 2px solid #6B7F4E; border-radius: 12px; padding: 1.5rem; margin-bottom: 0.5rem; box-shadow: 0 4px 16px rgba(107, 124, 63, 0.3); transition: all 0.3s ease;'><div style='display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.25rem;'><div style='flex: 1;'><div style='display: flex; align-items: center;'><div class='booking-id' style='margin-bottom: 0.5rem;'>{html.escape(str(booking['booking_id']))}</div>{hotel_badge}</div><div class='booking-email'>{html.escape(str(booking['guest_email']))}</div></div><div style='text-align: right;'><div class='timestamp'>REQUESTED</div><div class='timestamp-value'>{requested_time}</div></div></div><div style='margin-bottom: 1.5rem;'>{progress_html}</div><div style='height: 1px; background: linear-gradient(90deg, transparent, #6B7F4E, transparent); margin: 1.5rem 0;'></div>{tee_times_section_html}{hotel_details_html}</div>"

            # Render the complete card
            st.markdown(card_html, unsafe_allow_html=True)

            # Notes dropdown/expander
            with st.expander("📝 View/Edit Booking Notes & Email Content", expanded=False):
                # Display current notes
                st.markdown("""
                    <div style='background: #4C7A93; padding: 0.75rem 1rem; border-radius: 8px 8px 0 0; border: 2px solid #6B7F4E; border-bottom: none; margin-bottom: 0;'>
                        <div style='color: #E0D5BE; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin: 0;'>Current Notes</div>
                    </div>
                """, unsafe_allow_html=True)

                # Editable notes text area
                updated_note = st.text_area(
                    label="Edit notes",
                    value=note_content,
                    height=250,
                    disabled=False,
                    label_visibility="collapsed",
                    key=f"note_edit_{booking['booking_id']}"
                )

                # Save notes button
                if updated_note != note_content:
                    if st.button("💾 Save Notes", key=f"save_note_{booking['booking_id']}", use_container_width=True):
                        if update_booking_note(booking['booking_id'], updated_note):
                            st.success("Notes saved successfully!")
                            st.cache_data.clear()
                            st.rerun()
                        else:
                            st.error("Failed to save notes")

                # Show last updated info if available
                if booking.get('updated_by') and not pd.isna(booking.get('updated_by')):
                    st.markdown(f"""
                        <div style='margin-top: 1rem; padding: 0.75rem; background: #2B4048; border-radius: 8px; border: 2px solid #6B7F4E;'>
                            <div style='color: #E0D5BE; font-size: 0.7rem; font-weight: 600; text-transform: uppercase;'>Last Updated</div>
                            <div style='color: #F6F3EC; font-size: 0.875rem; margin-top: 0.25rem;'>{booking['updated_at'].strftime('%b %d, %Y • %I:%M %p')} by {booking['updated_by']}</div>
                        </div>
                    """, unsafe_allow_html=True)

            # Status navigation buttons - single row at bottom
            current_status = booking['status']

            # Create consistent button row for all statuses
            btn_cols = st.columns(6)

            # Column 0: Previous Stage (if applicable)
            with btn_cols[0]:
                if current_status == 'Requested':
                    if st.button("← Inquiry", key=f"nav_back_inq_{booking['booking_id']}", use_container_width=True):
                        if update_booking_status(booking['booking_id'], 'Inquiry', st.session_state.username):
                            st.cache_data.clear()
                            st.rerun()
                elif current_status == 'Confirmed':
                    if st.button("← Requested", key=f"nav_back_req_{booking['booking_id']}", use_container_width=True):
                        if update_booking_status(booking['booking_id'], 'Requested', st.session_state.username):
                            st.cache_data.clear()
                            st.rerun()
                elif current_status == 'Booked':
                    if st.button("← Confirmed", key=f"nav_back_conf_{booking['booking_id']}", use_container_width=True):
                        if update_booking_status(booking['booking_id'], 'Confirmed', st.session_state.username):
                            st.cache_data.clear()
                            st.rerun()

            # Column 1: To Requested
            with btn_cols[1]:
                if current_status in ['Inquiry', 'Pending']:
                    if st.button("→ Requested", key=f"nav_req_{booking['booking_id']}", use_container_width=True):
                        if update_booking_status(booking['booking_id'], 'Requested', st.session_state.username):
                            st.cache_data.clear()
                            st.rerun()

            # Column 2: To Confirmed
            with btn_cols[2]:
                if current_status == 'Requested':
                    if st.button("→ Confirmed", key=f"nav_conf_{booking['booking_id']}", use_container_width=True):
                        if update_booking_status(booking['booking_id'], 'Confirmed', st.session_state.username):
                            st.cache_data.clear()
                            st.rerun()

            # Column 3: To Booked
            with btn_cols[3]:
                if current_status == 'Confirmed':
                    if st.button("→ Booked", key=f"nav_book_{booking['booking_id']}", use_container_width=True):
                        if update_booking_status(booking['booking_id'], 'Booked', st.session_state.username):
                            st.cache_data.clear()
                            st.rerun()

            # Column 4: Reject/Cancel
            with btn_cols[4]:
                if current_status not in ['Rejected', 'Cancelled', 'Booked']:
                    if st.button("✕ Reject", key=f"nav_rej_{booking['booking_id']}", use_container_width=True):
                        if update_booking_status(booking['booking_id'], 'Rejected', st.session_state.username):
                            st.cache_data.clear()
                            st.rerun()
                elif current_status == 'Booked':
                    if st.button("✕ Cancel", key=f"nav_cancel_{booking['booking_id']}", use_container_width=True):
                        if update_booking_status(booking['booking_id'], 'Cancelled', st.session_state.username):
                            st.cache_data.clear()
                            st.rerun()

            # Column 5: Restore (for rejected/cancelled)
            with btn_cols[5]:
                if current_status in ['Rejected', 'Cancelled']:
                    if st.button("↻ Restore", key=f"nav_restore_{booking['booking_id']}", use_container_width=True):
                        if update_booking_status(booking['booking_id'], 'Inquiry', st.session_state.username):
                            st.cache_data.clear()
                            st.rerun()

            # Add visual separator between bookings
            st.markdown("<div style='height: 1.5rem;'></div>", unsafe_allow_html=True)

    # End of booking cards loop

    st.markdown("<div style='height: 2px; background: #6B7F4E; margin: 2rem 0;'></div>", unsafe_allow_html=True)

    st.markdown("#### Export Options")
    col1, col2, col3, col4 = st.columns(4)
    
    with col1:
        if st.button("Export to Excel", use_container_width=True):
            output = BytesIO()
            with pd.ExcelWriter(output, engine='openpyxl') as writer:
                filtered_df.to_excel(writer, index=False, sheet_name='Bookings')
    
            st.download_button(
                label="Download Excel",
                data=output.getvalue(),
                file_name=f"bookings_{datetime.now().strftime('%Y%m%d')}.xlsx",
                mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                use_container_width=True
            )
    
    with col2:
        if st.button("Export to CSV", use_container_width=True):
            csv = filtered_df.to_csv(index=False)
            st.download_button(
                label="Download CSV",
                data=csv,
                file_name=f"bookings_{datetime.now().strftime('%Y%m%d')}.csv",
                mime="text/csv",
                use_container_width=True
            )
    
    with col3:
        if st.button("Refresh Data", use_container_width=True):
            st.cache_data.clear()
            st.rerun()
    
    with col4:
        if st.button("Fix Tee Times", use_container_width=True):
            with st.spinner("Extracting tee times from email content..."):
                updated, not_found = fix_all_tee_times(st.session_state.customer_id)
                if updated > 0:
                    st.success(f"Updated {updated} booking(s) with extracted tee times!")
                    st.cache_data.clear()
                    st.rerun()
                elif not_found > 0:
                    st.warning(f"Could not extract tee times from {not_found} booking(s)")
                else:
                    st.info("All bookings already have tee times set")

elif page == "Reports & Analytics":
    st.markdown("""
        <h2 style='margin-bottom: 0.5rem;'>Reports & Analytics</h2>
        <p style='color: #997424; margin-bottom: 1.5rem; font-size: 0.9375rem;'>Comprehensive insights into your booking performance</p>
    """, unsafe_allow_html=True)

    # Load all bookings for analytics
    df_analytics, source = load_bookings_from_db(st.session_state.customer_id)

    if df_analytics.empty:
        st.info("No booking data available for analytics")
    else:
        # Date range selector for analytics
        st.markdown("### Analysis Period")
        col_range1, col_range2 = st.columns([1, 3])

        with col_range1:
            analysis_period = st.selectbox(
                "Period",
                ["Last 7 Days", "Last 30 Days", "Last 90 Days", "Last 6 Months", "Last Year", "All Time", "Custom"],
                index=1
            )

        with col_range2:
            if analysis_period == "Last 7 Days":
                analysis_start = datetime.now() - timedelta(days=7)
                analysis_end = datetime.now()
            elif analysis_period == "Last 30 Days":
                analysis_start = datetime.now() - timedelta(days=30)
                analysis_end = datetime.now()
            elif analysis_period == "Last 90 Days":
                analysis_start = datetime.now() - timedelta(days=90)
                analysis_end = datetime.now()
            elif analysis_period == "Last 6 Months":
                analysis_start = datetime.now() - timedelta(days=180)
                analysis_end = datetime.now()
            elif analysis_period == "Last Year":
                analysis_start = datetime.now() - timedelta(days=365)
                analysis_end = datetime.now()
            elif analysis_period == "All Time":
                analysis_start = df_analytics['timestamp'].min()
                analysis_end = datetime.now()
            else:  # Custom
                custom_range = st.date_input(
                    "Custom Range",
                    value=(datetime.now().date() - timedelta(days=30), datetime.now().date())
                )
                if isinstance(custom_range, tuple) and len(custom_range) == 2:
                    analysis_start = pd.to_datetime(custom_range[0])
                    analysis_end = pd.to_datetime(custom_range[1])
                else:
                    analysis_start = datetime.now() - timedelta(days=30)
                    analysis_end = datetime.now()

        # Filter data by analysis period
        analysis_df = df_analytics[
            (df_analytics['timestamp'] >= pd.to_datetime(analysis_start)) &
            (df_analytics['timestamp'] <= pd.to_datetime(analysis_end))
        ].copy()

        st.markdown("<div style='height: 2px; background: #997424; margin: 1.5rem 0;'></div>", unsafe_allow_html=True)

        # ========================================
        # KEY METRICS OVERVIEW
        # ========================================
        st.markdown("### Key Metrics")

        metric_col1, metric_col2, metric_col3, metric_col4 = st.columns(4)

        with metric_col1:
            total_bookings = len(analysis_df)
            st.markdown(f"""
                <div style='background: linear-gradient(135deg, #081c3c 0%, #0d2847 100%); border: 2px solid #997424; border-radius: 12px; padding: 1.5rem; text-align: center;'>
                    <div style='color: #997424; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.5rem;'>Total Bookings</div>
                    <div style='color: #fffefe; font-size: 2.5rem; font-weight: 700;'>{total_bookings}</div>
                </div>
            """, unsafe_allow_html=True)

        with metric_col2:
            total_revenue = analysis_df['total'].sum()
            st.markdown(f"""
                <div style='background: linear-gradient(135deg, #081c3c 0%, #0d2847 100%); border: 2px solid #997424; border-radius: 12px; padding: 1.5rem; text-align: center;'>
                    <div style='color: #997424; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.5rem;'>Total Revenue</div>
                    <div style='color: #10b981; font-size: 2.5rem; font-weight: 700;'>{CURRENCY_SYMBOL}{total_revenue:,.0f}</div>
                </div>
            """, unsafe_allow_html=True)

        with metric_col3:
            avg_booking_value = analysis_df['total'].mean() if len(analysis_df) > 0 else 0
            st.markdown(f"""
                <div style='background: linear-gradient(135deg, #081c3c 0%, #0d2847 100%); border: 2px solid #997424; border-radius: 12px; padding: 1.5rem; text-align: center;'>
                    <div style='color: #997424; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.5rem;'>Avg Booking Value</div>
                    <div style='color: #fffefe; font-size: 2.5rem; font-weight: 700;'>{CURRENCY_SYMBOL}{avg_booking_value:,.0f}</div>
                </div>
            """, unsafe_allow_html=True)

        with metric_col4:
            total_players = analysis_df['players'].sum()
            st.markdown(f"""
                <div style='background: linear-gradient(135deg, #081c3c 0%, #0d2847 100%); border: 2px solid #997424; border-radius: 12px; padding: 1.5rem; text-align: center;'>
                    <div style='color: #997424; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.5rem;'>Total Players</div>
                    <div style='color: #fffefe; font-size: 2.5rem; font-weight: 700;'>{int(total_players)}</div>
                </div>
            """, unsafe_allow_html=True)

        st.markdown("<div style='height: 2px; background: #997424; margin: 2rem 0;'></div>", unsafe_allow_html=True)

        # ========================================
        # BOOKING STATUS DISTRIBUTION
        # ========================================
        col_charts1, col_charts2 = st.columns(2)

        with col_charts1:
            st.markdown("### Booking Status Distribution")
            status_counts = analysis_df['status'].value_counts()

            status_data = []
            for status, count in status_counts.items():
                percentage = (count / len(analysis_df)) * 100
                status_data.append({
                    'Status': status,
                    'Count': count,
                    'Percentage': percentage
                })

            status_summary_df = pd.DataFrame(status_data)

            # Display as a styled table
            for _, row in status_summary_df.iterrows():
                bar_width = row['Percentage']
                st.markdown(f"""
                    <div style='background: #0d2847; border: 2px solid #997424; border-radius: 8px; padding: 1rem; margin-bottom: 0.75rem;'>
                        <div style='display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;'>
                            <div style='color: #fffefe; font-weight: 600; font-size: 1rem;'>{row['Status']}</div>
                            <div style='color: #997424; font-weight: 700; font-size: 1.125rem;'>{int(row['Count'])}</div>
                        </div>
                        <div style='background: #081c3c; border-radius: 4px; height: 8px; overflow: hidden;'>
                            <div style='background: linear-gradient(90deg, #997424, #10b981); height: 100%; width: {bar_width}%;'></div>
                        </div>
                        <div style='color: #64748b; font-size: 0.75rem; margin-top: 0.25rem;'>{row['Percentage']:.1f}% of total</div>
                    </div>
                """, unsafe_allow_html=True)

        with col_charts2:
            st.markdown("### Revenue by Status")
            revenue_by_status = analysis_df.groupby('status')['total'].sum().sort_values(ascending=False)

            total_rev = revenue_by_status.sum()

            for status, revenue in revenue_by_status.items():
                percentage = (revenue / total_rev) * 100 if total_rev > 0 else 0
                bar_width = percentage

                st.markdown(f"""
                    <div style='background: #0d2847; border: 2px solid #997424; border-radius: 8px; padding: 1rem; margin-bottom: 0.75rem;'>
                        <div style='display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;'>
                            <div style='color: #fffefe; font-weight: 600; font-size: 1rem;'>{status}</div>
                            <div style='color: #10b981; font-weight: 700; font-size: 1.125rem;'>{CURRENCY_SYMBOL}{revenue:,.0f}</div>
                        </div>
                        <div style='background: #081c3c; border-radius: 4px; height: 8px; overflow: hidden;'>
                            <div style='background: linear-gradient(90deg, #10b981, #997424); height: 100%; width: {bar_width}%;'></div>
                        </div>
                        <div style='color: #64748b; font-size: 0.75rem; margin-top: 0.25rem;'>{percentage:.1f}% of revenue</div>
                    </div>
                """, unsafe_allow_html=True)

        st.markdown("<div style='height: 2px; background: #997424; margin: 2rem 0;'></div>", unsafe_allow_html=True)

        # ========================================
        # BOOKING TRENDS OVER TIME
        # ========================================
        st.markdown("### Booking Trends Over Time")

        # Group by date
        analysis_df['booking_date'] = analysis_df['timestamp'].dt.date
        daily_bookings = analysis_df.groupby('booking_date').agg({
            'booking_id': 'count',
            'total': 'sum',
            'players': 'sum'
        }).reset_index()
        daily_bookings.columns = ['Date', 'Bookings', 'Revenue', 'Players']

        # Create simple line chart display
        st.markdown("#### Daily Booking Volume")

        if len(daily_bookings) > 0:
            max_bookings = daily_bookings['Bookings'].max()

            for _, row in daily_bookings.tail(30).iterrows():  # Show last 30 days
                bar_width = (row['Bookings'] / max_bookings) * 100 if max_bookings > 0 else 0

                st.markdown(f"""
                    <div style='display: flex; align-items: center; gap: 1rem; margin-bottom: 0.5rem;'>
                        <div style='color: #997424; font-weight: 600; min-width: 100px; font-size: 0.875rem;'>{row['Date']}</div>
                        <div style='flex: 1; background: #0d2847; border-radius: 4px; height: 24px; overflow: hidden; border: 1px solid #997424;'>
                            <div style='background: linear-gradient(90deg, #997424, #10b981); height: 100%; width: {bar_width}%; display: flex; align-items: center; padding-left: 0.5rem;'>
                                <span style='color: #fffefe; font-weight: 600; font-size: 0.75rem;'>{int(row['Bookings'])}</span>
                            </div>
                        </div>
                        <div style='color: #10b981; font-weight: 700; min-width: 80px; text-align: right; font-size: 0.875rem;'>{CURRENCY_SYMBOL}{row['Revenue']:,.0f}</div>
                    </div>
                """, unsafe_allow_html=True)
        else:
            st.info("No booking trend data available")

        st.markdown("<div style='height: 2px; background: #997424; margin: 2rem 0;'></div>", unsafe_allow_html=True)

        # ========================================
        # CONVERSION FUNNEL
        # ========================================
        st.markdown("### Booking Conversion Funnel")

        funnel_stages = [
            ('Inquiry', len(analysis_df[analysis_df['status'].isin(['Inquiry', 'Pending'])])),
            ('Requested', len(analysis_df[analysis_df['status'] == 'Requested'])),
            ('Confirmed', len(analysis_df[analysis_df['status'] == 'Confirmed'])),
            ('Booked', len(analysis_df[analysis_df['status'] == 'Booked']))
        ]

        total_funnel = sum([count for _, count in funnel_stages])

        if total_funnel > 0:
            for i, (stage, count) in enumerate(funnel_stages):
                percentage = (count / total_funnel) * 100
                bar_width = percentage

                # Calculate conversion from previous stage
                if i > 0:
                    prev_count = funnel_stages[i-1][1]
                    conversion = (count / prev_count) * 100 if prev_count > 0 else 0
                    conversion_text = f"<div style='color: #64748b; font-size: 0.75rem; margin-top: 0.25rem;'>Conversion: {conversion:.1f}% from previous stage</div>"
                else:
                    conversion_text = ""

                st.markdown(f"""
                    <div style='background: linear-gradient(135deg, #081c3c 0%, #0d2847 100%); border: 2px solid #997424; border-radius: 8px; padding: 1.25rem; margin-bottom: 1rem;'>
                        <div style='display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;'>
                            <div style='color: #fffefe; font-weight: 700; font-size: 1.25rem;'>{stage}</div>
                            <div style='color: #997424; font-weight: 700; font-size: 1.5rem;'>{count}</div>
                        </div>
                        <div style='background: #081c3c; border-radius: 6px; height: 12px; overflow: hidden;'>
                            <div style='background: linear-gradient(90deg, #997424, #10b981); height: 100%; width: {bar_width}%;'></div>
                        </div>
                        <div style='color: #64748b; font-size: 0.75rem; margin-top: 0.5rem;'>{percentage:.1f}% of total funnel volume</div>
                        {conversion_text}
                    </div>
                """, unsafe_allow_html=True)

            # Overall conversion rate
            booked_count = funnel_stages[-1][1]
            inquiry_count = funnel_stages[0][1]
            overall_conversion = (booked_count / inquiry_count) * 100 if inquiry_count > 0 else 0

            st.markdown(f"""
                <div style='background: #3a5a40; border: 2px solid #10b981; border-radius: 12px; padding: 1.5rem; text-align: center; margin-top: 1.5rem;'>
                    <div style='color: #ffffff; font-size: 0.875rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.5rem;'>Overall Conversion Rate</div>
                    <div style='color: #10b981; font-size: 3rem; font-weight: 700;'>{overall_conversion:.1f}%</div>
                    <div style='color: rgba(255,255,255,0.8); font-size: 0.875rem; margin-top: 0.5rem;'>From Inquiry to Booked</div>
                </div>
            """, unsafe_allow_html=True)
        else:
            st.info("No funnel data available for this period")

        st.markdown("<div style='height: 2px; background: #997424; margin: 2rem 0;'></div>", unsafe_allow_html=True)

        # ========================================
        # HOTEL BOOKING ANALYTICS
        # ========================================
        st.markdown("### Hotel Booking Analytics")

        # Filter hotel bookings
        hotel_bookings = analysis_df[analysis_df['hotel_required'] == True].copy()
        non_hotel_bookings = analysis_df[analysis_df['hotel_required'] == False].copy()

        # Calculate hotel metrics
        total_hotel_bookings = len(hotel_bookings)
        hotel_attachment_rate = (total_hotel_bookings / len(analysis_df) * 100) if len(analysis_df) > 0 else 0

        # Handle NaN values for lodging_cost
        hotel_bookings_with_cost = hotel_bookings[hotel_bookings['lodging_cost'].notna()]
        total_hotel_revenue = hotel_bookings_with_cost['lodging_cost'].sum()
        avg_lodging_cost = hotel_bookings_with_cost['lodging_cost'].mean() if len(hotel_bookings_with_cost) > 0 else 0

        # Calculate golf revenue for hotel bookings
        hotel_golf_revenue = hotel_bookings['total'].sum() - total_hotel_revenue

        # Occupancy metrics
        hotel_bookings_with_nights = hotel_bookings[hotel_bookings['lodging_nights'].notna()]
        avg_nights = hotel_bookings_with_nights['lodging_nights'].mean() if len(hotel_bookings_with_nights) > 0 else 0
        total_room_nights = hotel_bookings_with_nights['lodging_nights'].sum() if len(hotel_bookings_with_nights) > 0 else 0

        hotel_bookings_with_rooms = hotel_bookings[hotel_bookings['lodging_rooms'].notna()]
        avg_rooms = hotel_bookings_with_rooms['lodging_rooms'].mean() if len(hotel_bookings_with_rooms) > 0 else 0

        # Hotel overview metrics
        st.markdown("#### Hotel Booking Overview")
        hotel_metric_col1, hotel_metric_col2, hotel_metric_col3, hotel_metric_col4 = st.columns(4)

        with hotel_metric_col1:
            st.markdown(f"""
                <div style='background: linear-gradient(135deg, #E8B31C 0%, #a86d44 100%); border: 2px solid #fffefe; border-radius: 12px; padding: 1.5rem; text-align: center;'>
                    <div style='color: #fffefe; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.5rem;'>Hotel Bookings</div>
                    <div style='color: #fffefe; font-size: 2.5rem; font-weight: 700;'>{total_hotel_bookings}</div>
                    <div style='color: rgba(255,254,254,0.8); font-size: 0.75rem; margin-top: 0.5rem;'>{hotel_attachment_rate:.1f}% of all bookings</div>
                </div>
            """, unsafe_allow_html=True)

        with hotel_metric_col2:
            st.markdown(f"""
                <div style='background: linear-gradient(135deg, #E8B31C 0%, #a86d44 100%); border: 2px solid #fffefe; border-radius: 12px; padding: 1.5rem; text-align: center;'>
                    <div style='color: #fffefe; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.5rem;'>Hotel Revenue</div>
                    <div style='color: #10b981; font-size: 2.5rem; font-weight: 700;'>{CURRENCY_SYMBOL}{total_hotel_revenue:,.0f}</div>
                    <div style='color: rgba(255,254,254,0.8); font-size: 0.75rem; margin-top: 0.5rem;'>Avg: {CURRENCY_SYMBOL}{avg_lodging_cost:,.0f}</div>
                </div>
            """, unsafe_allow_html=True)

        with hotel_metric_col3:
            st.markdown(f"""
                <div style='background: linear-gradient(135deg, #E8B31C 0%, #a86d44 100%); border: 2px solid #fffefe; border-radius: 12px; padding: 1.5rem; text-align: center;'>
                    <div style='color: #fffefe; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.5rem;'>Avg Nights</div>
                    <div style='color: #fffefe; font-size: 2.5rem; font-weight: 700;'>{avg_nights:.1f}</div>
                    <div style='color: rgba(255,254,254,0.8); font-size: 0.75rem; margin-top: 0.5rem;'>Total: {int(total_room_nights)} nights</div>
                </div>
            """, unsafe_allow_html=True)

        with hotel_metric_col4:
            st.markdown(f"""
                <div style='background: linear-gradient(135deg, #E8B31C 0%, #a86d44 100%); border: 2px solid #fffefe; border-radius: 12px; padding: 1.5rem; text-align: center;'>
                    <div style='color: #fffefe; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.5rem;'>Avg Rooms</div>
                    <div style='color: #fffefe; font-size: 2.5rem; font-weight: 700;'>{avg_rooms:.1f}</div>
                    <div style='color: rgba(255,254,254,0.8); font-size: 0.75rem; margin-top: 0.5rem;'>per booking</div>
                </div>
            """, unsafe_allow_html=True)

        st.markdown("<div style='height: 1px; background: rgba(153, 116, 36, 0.3); margin: 1.5rem 0;'></div>", unsafe_allow_html=True)

        # Revenue comparison and room type analytics
        hotel_col1, hotel_col2 = st.columns(2)

        with hotel_col1:
            st.markdown("#### Revenue Breakdown: Golf vs Hotel")

            # Calculate total revenue from hotel bookings
            total_package_revenue = hotel_bookings['total'].sum()
            hotel_revenue_percentage = (total_hotel_revenue / total_package_revenue * 100) if total_package_revenue > 0 else 0
            golf_revenue_percentage = (hotel_golf_revenue / total_package_revenue * 100) if total_package_revenue > 0 else 0

            # Golf revenue bar
            st.markdown(f"""
                <div style='background: #0d2847; border: 2px solid #997424; border-radius: 8px; padding: 1rem; margin-bottom: 0.75rem;'>
                    <div style='display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;'>
                        <div style='color: #fffefe; font-weight: 600; font-size: 1rem;'>⛳ Golf Revenue</div>
                        <div style='color: #10b981; font-weight: 700; font-size: 1.125rem;'>{CURRENCY_SYMBOL}{hotel_golf_revenue:,.0f}</div>
                    </div>
                    <div style='background: #081c3c; border-radius: 4px; height: 8px; overflow: hidden;'>
                        <div style='background: linear-gradient(90deg, #997424, #10b981); height: 100%; width: {golf_revenue_percentage}%;'></div>
                    </div>
                    <div style='color: #64748b; font-size: 0.75rem; margin-top: 0.25rem;'>{golf_revenue_percentage:.1f}% of package revenue</div>
                </div>
            """, unsafe_allow_html=True)

            # Hotel revenue bar
            st.markdown(f"""
                <div style='background: #0d2847; border: 2px solid #E8B31C; border-radius: 8px; padding: 1rem; margin-bottom: 0.75rem;'>
                    <div style='display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;'>
                        <div style='color: #fffefe; font-weight: 600; font-size: 1rem;'>🏨 Hotel Revenue</div>
                        <div style='color: #E8B31C; font-weight: 700; font-size: 1.125rem;'>{CURRENCY_SYMBOL}{total_hotel_revenue:,.0f}</div>
                    </div>
                    <div style='background: #081c3c; border-radius: 4px; height: 8px; overflow: hidden;'>
                        <div style='background: linear-gradient(90deg, #E8B31C, #a86d44); height: 100%; width: {hotel_revenue_percentage}%;'></div>
                    </div>
                    <div style='color: #64748b; font-size: 0.75rem; margin-top: 0.25rem;'>{hotel_revenue_percentage:.1f}% of package revenue</div>
                </div>
            """, unsafe_allow_html=True)

            # Total package revenue
            st.markdown(f"""
                <div style='background: linear-gradient(135deg, #3a5a40 0%, #2d4a32 100%); border: 2px solid #10b981; border-radius: 8px; padding: 1rem; text-align: center;'>
                    <div style='color: rgba(255,255,255,0.8); font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.25rem;'>Total Package Revenue</div>
                    <div style='color: #10b981; font-size: 2rem; font-weight: 700;'>{CURRENCY_SYMBOL}{total_package_revenue:,.0f}</div>
                </div>
            """, unsafe_allow_html=True)

        with hotel_col2:
            st.markdown("#### Popular Room Types")

            # Get room type distribution
            hotel_with_room_type = hotel_bookings[hotel_bookings['lodging_room_type'].notna()]

            if len(hotel_with_room_type) > 0:
                room_type_counts = hotel_with_room_type['lodging_room_type'].value_counts()
                max_room_count = room_type_counts.max()

                for room_type, count in room_type_counts.head(8).items():
                    bar_width = (count / max_room_count * 100) if max_room_count > 0 else 0
                    percentage = (count / len(hotel_with_room_type) * 100)

                    st.markdown(f"""
                        <div style='background: #0d2847; border: 1px solid #E8B31C; border-radius: 6px; padding: 0.75rem; margin-bottom: 0.5rem;'>
                            <div style='display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;'>
                                <div style='color: #fffefe; font-weight: 600; font-size: 0.875rem;'>{room_type}</div>
                                <div style='color: #E8B31C; font-weight: 700;'>{int(count)}</div>
                            </div>
                            <div style='background: #081c3c; border-radius: 3px; height: 6px; overflow: hidden;'>
                                <div style='background: linear-gradient(90deg, #E8B31C, #a86d44); height: 100%; width: {bar_width}%;'></div>
                            </div>
                            <div style='color: #64748b; font-size: 0.7rem; margin-top: 0.25rem;'>{percentage:.1f}% of hotel bookings</div>
                        </div>
                    """, unsafe_allow_html=True)
            else:
                st.info("No room type data available")

        st.markdown("<div style='height: 1px; background: rgba(153, 116, 36, 0.3); margin: 1.5rem 0;'></div>", unsafe_allow_html=True)

        # Hotel vs Non-Hotel comparison and occupancy distribution
        hotel_col3, hotel_col4 = st.columns(2)

        with hotel_col3:
            st.markdown("#### Hotel vs Non-Hotel Bookings")

            hotel_count = len(hotel_bookings)
            non_hotel_count = len(non_hotel_bookings)
            total_count = len(analysis_df)

            # Hotel bookings
            hotel_percentage = (hotel_count / total_count * 100) if total_count > 0 else 0
            st.markdown(f"""
                <div style='background: linear-gradient(135deg, #E8B31C 0%, #a86d44 100%); border: 2px solid #fffefe; border-radius: 8px; padding: 1.25rem; margin-bottom: 1rem;'>
                    <div style='display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;'>
                        <div style='color: #fffefe; font-weight: 700; font-size: 1.125rem;'>🏨 With Hotel</div>
                        <div style='color: #fffefe; font-weight: 700; font-size: 1.5rem;'>{hotel_count}</div>
                    </div>
                    <div style='background: rgba(8, 28, 60, 0.5); border-radius: 6px; height: 12px; overflow: hidden;'>
                        <div style='background: #fffefe; height: 100%; width: {hotel_percentage}%;'></div>
                    </div>
                    <div style='color: rgba(255,254,254,0.9); font-size: 0.75rem; margin-top: 0.5rem;'>{hotel_percentage:.1f}% of all bookings</div>
                </div>
            """, unsafe_allow_html=True)

            # Non-hotel bookings
            non_hotel_percentage = (non_hotel_count / total_count * 100) if total_count > 0 else 0
            st.markdown(f"""
                <div style='background: linear-gradient(135deg, #0d2847 0%, #081c3c 100%); border: 2px solid #997424; border-radius: 8px; padding: 1.25rem;'>
                    <div style='display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;'>
                        <div style='color: #fffefe; font-weight: 700; font-size: 1.125rem;'>⛳ Golf Only</div>
                        <div style='color: #997424; font-weight: 700; font-size: 1.5rem;'>{non_hotel_count}</div>
                    </div>
                    <div style='background: #081c3c; border-radius: 6px; height: 12px; overflow: hidden;'>
                        <div style='background: linear-gradient(90deg, #997424, #10b981); height: 100%; width: {non_hotel_percentage}%;'></div>
                    </div>
                    <div style='color: #64748b; font-size: 0.75rem; margin-top: 0.5rem;'>{non_hotel_percentage:.1f}% of all bookings</div>
                </div>
            """, unsafe_allow_html=True)

        with hotel_col4:
            st.markdown("#### Lodging Nights Distribution")

            if len(hotel_bookings_with_nights) > 0:
                nights_distribution = hotel_bookings_with_nights['lodging_nights'].value_counts().sort_index()
                max_nights_count = nights_distribution.max()

                for nights, count in nights_distribution.items():
                    bar_width = (count / max_nights_count * 100) if max_nights_count > 0 else 0
                    percentage = (count / len(hotel_bookings_with_nights) * 100)

                    night_label = f"{int(nights)} night" if nights == 1 else f"{int(nights)} nights"

                    st.markdown(f"""
                        <div style='background: #0d2847; border: 1px solid #997424; border-radius: 6px; padding: 0.75rem; margin-bottom: 0.5rem;'>
                            <div style='display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;'>
                                <div style='color: #fffefe; font-weight: 600;'>{night_label}</div>
                                <div style='color: #997424; font-weight: 700;'>{int(count)} bookings</div>
                            </div>
                            <div style='background: #081c3c; border-radius: 3px; height: 6px; overflow: hidden;'>
                                <div style='background: #997424; height: 100%; width: {bar_width}%;'></div>
                            </div>
                            <div style='color: #64748b; font-size: 0.7rem; margin-top: 0.25rem;'>{percentage:.1f}% of stays</div>
                        </div>
                    """, unsafe_allow_html=True)
            else:
                st.info("No lodging nights data available")

        st.markdown("<div style='height: 2px; background: #997424; margin: 2rem 0;'></div>", unsafe_allow_html=True)

        # ========================================
        # PEAK BOOKING TIMES
        # ========================================
        st.markdown("### Peak Booking Times")

        col_peak1, col_peak2 = st.columns(2)

        with col_peak1:
            st.markdown("#### Most Popular Tee Times")
            tee_time_popularity = analysis_df[analysis_df['tee_time'].notna()].groupby('tee_time').size().sort_values(ascending=False).head(10)

            if len(tee_time_popularity) > 0:
                max_pop = tee_time_popularity.max()

                for tee_time, count in tee_time_popularity.items():
                    bar_width = (count / max_pop) * 100 if max_pop > 0 else 0

                    st.markdown(f"""
                        <div style='background: #0d2847; border: 1px solid #997424; border-radius: 6px; padding: 0.75rem; margin-bottom: 0.5rem;'>
                            <div style='display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;'>
                                <div style='color: #fffefe; font-weight: 600;'>{tee_time}</div>
                                <div style='color: #997424; font-weight: 700;'>{int(count)} bookings</div>
                            </div>
                            <div style='background: #081c3c; border-radius: 3px; height: 6px; overflow: hidden;'>
                                <div style='background: #997424; height: 100%; width: {bar_width}%;'></div>
                            </div>
                        </div>
                    """, unsafe_allow_html=True)
            else:
                st.info("No tee time data available")

        with col_peak2:
            st.markdown("#### Busiest Days of Week")
            analysis_df['day_of_week'] = pd.to_datetime(analysis_df['date']).dt.day_name()
            day_popularity = analysis_df.groupby('day_of_week').size().reindex(
                ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
                fill_value=0
            )

            if day_popularity.sum() > 0:
                max_day = day_popularity.max()

                for day, count in day_popularity.items():
                    bar_width = (count / max_day) * 100 if max_day > 0 else 0

                    st.markdown(f"""
                        <div style='background: #0d2847; border: 1px solid #997424; border-radius: 6px; padding: 0.75rem; margin-bottom: 0.5rem;'>
                            <div style='display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;'>
                                <div style='color: #fffefe; font-weight: 600;'>{day}</div>
                                <div style='color: #997424; font-weight: 700;'>{int(count)} bookings</div>
                            </div>
                            <div style='background: #081c3c; border-radius: 3px; height: 6px; overflow: hidden;'>
                                <div style='background: #10b981; height: 100%; width: {bar_width}%;'></div>
                            </div>
                        </div>
                    """, unsafe_allow_html=True)
            else:
                st.info("No day of week data available")

        st.markdown("<div style='height: 2px; background: #997424; margin: 2rem 0;'></div>", unsafe_allow_html=True)

        # ========================================
        # EXPORT ANALYTICS
        # ========================================
        st.markdown("### Export Analytics Data")

        export_col1, export_col2, export_col3 = st.columns(3)

        with export_col1:
            if st.button("Export Full Report (Excel)", key="analytics_export_excel", use_container_width=True):
                output = BytesIO()
                with pd.ExcelWriter(output, engine='openpyxl') as writer:
                    # Summary sheet
                    summary_data = {
                        'Metric': ['Total Bookings', 'Total Revenue', 'Avg Booking Value', 'Total Players'],
                        'Value': [total_bookings, f"{CURRENCY_SYMBOL}{total_revenue:,.2f}", f"{CURRENCY_SYMBOL}{avg_booking_value:,.2f}", int(total_players)]
                    }
                    pd.DataFrame(summary_data).to_excel(writer, index=False, sheet_name='Summary')

                    # Hotel analytics summary
                    hotel_summary_data = {
                        'Metric': [
                            'Hotel Bookings',
                            'Hotel Attachment Rate',
                            'Total Hotel Revenue',
                            'Avg Lodging Cost',
                            'Avg Nights per Stay',
                            'Total Room Nights',
                            'Avg Rooms per Booking',
                            'Total Package Revenue',
                            'Golf Revenue (Hotel Bookings)',
                            'Hotel Revenue (Hotel Bookings)'
                        ],
                        'Value': [
                            total_hotel_bookings,
                            f"{hotel_attachment_rate:.1f}%",
                            f"{CURRENCY_SYMBOL}{total_hotel_revenue:,.2f}",
                            f"{CURRENCY_SYMBOL}{avg_lodging_cost:,.2f}",
                            f"{avg_nights:.1f}",
                            int(total_room_nights),
                            f"{avg_rooms:.1f}",
                            f"{CURRENCY_SYMBOL}{total_package_revenue:,.2f}",
                            f"{CURRENCY_SYMBOL}{hotel_golf_revenue:,.2f}",
                            f"{CURRENCY_SYMBOL}{total_hotel_revenue:,.2f}"
                        ]
                    }
                    pd.DataFrame(hotel_summary_data).to_excel(writer, index=False, sheet_name='Hotel Summary')

                    # Room type distribution
                    if len(hotel_with_room_type) > 0:
                        room_type_data = hotel_with_room_type['lodging_room_type'].value_counts().reset_index()
                        room_type_data.columns = ['Room Type', 'Count']
                        room_type_data['Percentage'] = (room_type_data['Count'] / len(hotel_with_room_type) * 100).round(1)
                        room_type_data.to_excel(writer, index=False, sheet_name='Room Types')

                    # Lodging nights distribution
                    if len(hotel_bookings_with_nights) > 0:
                        nights_data = hotel_bookings_with_nights['lodging_nights'].value_counts().sort_index().reset_index()
                        nights_data.columns = ['Nights', 'Count']
                        nights_data['Percentage'] = (nights_data['Count'] / len(hotel_bookings_with_nights) * 100).round(1)
                        nights_data.to_excel(writer, index=False, sheet_name='Lodging Nights')

                    # Status distribution
                    status_summary_df.to_excel(writer, index=False, sheet_name='Status Distribution')

                    # Daily trends
                    daily_bookings.to_excel(writer, index=False, sheet_name='Daily Trends')

                    # Raw data
                    analysis_df.to_excel(writer, index=False, sheet_name='Raw Data')

                st.download_button(
                    label="Download Analytics Report",
                    data=output.getvalue(),
                    file_name=f"analytics_report_{datetime.now().strftime('%Y%m%d')}.xlsx",
                    mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    use_container_width=True,
                    key="analytics_download_excel"
                )

        with export_col2:
            if st.button("Export Summary (CSV)", key="analytics_export_csv", use_container_width=True):
                summary_csv = analysis_df.to_csv(index=False)
                st.download_button(
                    label="Download CSV",
                    data=summary_csv,
                    file_name=f"analytics_summary_{datetime.now().strftime('%Y%m%d')}.csv",
                    mime="text/csv",
                    use_container_width=True,
                    key="analytics_download_csv"
                )

        with export_col3:
            if st.button("Refresh Analytics", key="analytics_refresh", use_container_width=True):
                st.cache_data.clear()
                st.rerun()

    # Reports Section (part of Reports & Analytics page)
    st.markdown("<div style='height: 3px; background: linear-gradient(90deg, #6B7F4E, #997424); margin: 3rem 0;'></div>", unsafe_allow_html=True)
    st.markdown("""
        <h2 style='margin-bottom: 0.5rem;'>Reports</h2>
        <p style='color: #E0D5BE; margin-bottom: 1rem; font-size: 0.9375rem;'>Generate and export detailed reports</p>
    """, unsafe_allow_html=True)

    # Load data for reports
    df_reports, _ = load_bookings_from_db(st.session_state.customer_id)

    if not df_reports.empty:
        # Report date range selector
        st.markdown("### Report Period")
        report_col1, report_col2 = st.columns(2)

        with report_col1:
            report_start = st.date_input("Start Date", value=datetime.now().date() - timedelta(days=30))

        with report_col2:
            report_end = st.date_input("End Date", value=datetime.now().date())

        # Filter data by report period
        report_df = df_reports[
            (df_reports['date'].dt.date >= report_start) &
            (df_reports['date'].dt.date <= report_end)
        ]

        st.markdown("<div style='height: 2px; background: #6B7F4E; margin: 2rem 0;'></div>", unsafe_allow_html=True)

        # Report summary
        st.markdown("### Report Summary")

        summary_col1, summary_col2, summary_col3 = st.columns(3)

        with summary_col1:
            total_in_period = len(report_df)
            st.metric("Total Bookings", total_in_period)

        with summary_col2:
            booked_in_period = len(report_df[report_df['status'] == 'Booked'])
            st.metric("Confirmed Bookings", booked_in_period)

        with summary_col3:
            revenue_in_period = report_df[report_df['status'] == 'Booked']['total'].sum()
            st.metric("Revenue", f"{CURRENCY_SYMBOL}{revenue_in_period:,.2f}")

        st.markdown("<div style='height: 2px; background: #6B7F4E; margin: 2rem 0;'></div>", unsafe_allow_html=True)

        # Export options
        st.markdown("### Export Report")

        export_col1, export_col2, export_col3 = st.columns(3)

        with export_col1:
            if st.button("Export Full Report (Excel)", use_container_width=True):
                output = BytesIO()
                with pd.ExcelWriter(output, engine='openpyxl') as writer:
                    report_df.to_excel(writer, index=False, sheet_name='Bookings Report')

                st.download_button(
                    label="Download Excel Report",
                    data=output.getvalue(),
                    file_name=f"dornoch_report_{report_start}_{report_end}.xlsx",
                    mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    use_container_width=True
                )

        with export_col2:
            if st.button("Export Summary (CSV)", use_container_width=True):
                csv = report_df.to_csv(index=False)
                st.download_button(
                    label="Download CSV Report",
                    data=csv,
                    file_name=f"dornoch_report_{report_start}_{report_end}.csv",
                    mime="text/csv",
                    use_container_width=True
                )

        # Data preview
        st.markdown("<div style='height: 2px; background: #6B7F4E; margin: 2rem 0;'></div>", unsafe_allow_html=True)
        st.markdown("### Data Preview")
        st.dataframe(report_df[['booking_id', 'guest_email', 'date', 'tee_time', 'players', 'hotel_required', 'total', 'status']], use_container_width=True)
    else:
        st.info("No data available for reports")

# ========================================
# WAITLIST VIEW
# ========================================
elif page == "Waitlist":
    st.markdown("""
        <h2 style='margin-bottom: 0.5rem;'>Waitlist Management</h2>
        <p style='color: #E0D5BE; margin-bottom: 1.5rem;'>Manage customer waitlist for tee times</p>
    """, unsafe_allow_html=True)

    # Load waitlist
    waitlist_df = load_waitlist_from_db(st.session_state.customer_id)

    # Add new waitlist entry section
    with st.expander("Add New Waitlist Entry", expanded=False):
        with st.form("add_waitlist_form"):
            col1, col2 = st.columns(2)
            with col1:
                guest_email = st.text_input("Guest Email *")
                guest_name = st.text_input("Guest Name")
                requested_date = st.date_input("Requested Date *")
                preferred_time = st.text_input("Preferred Time", placeholder="e.g., 10:00 AM")
            with col2:
                time_flexibility = st.selectbox(
                    "Time Flexibility",
                    ["Flexible", "Morning Only", "Afternoon Only", "Specific Time Only"]
                )
                players = st.number_input("Number of Players", min_value=1, max_value=4, value=1)
                golf_course = st.text_input("Golf Course", value="Royal Dornoch Golf Club")
                priority = st.slider("Priority (1=Low, 10=High)", min_value=1, max_value=10, value=5)

            notes = st.text_area("Notes", placeholder="Additional information about this waitlist entry")

            submitted = st.form_submit_button("Add to Waitlist", use_container_width=True)
            if submitted:
                if not guest_email or not requested_date:
                    st.error("Please provide guest email and requested date")
                else:
                    success, waitlist_id = add_to_waitlist(
                        guest_email, guest_name, requested_date, preferred_time,
                        time_flexibility, players, golf_course, notes,
                        st.session_state.customer_id, priority
                    )
                    if success:
                        st.success(f"Added to waitlist! Waitlist ID: {waitlist_id}")
                        st.cache_data.clear()
                        st.rerun()

    st.markdown("<div style='height: 2px; background: #6B7F4E; margin: 2rem 0;'></div>", unsafe_allow_html=True)

    # Display waitlist entries
    if waitlist_df.empty:
        st.info("No waitlist entries found")
    else:
        st.markdown(f"### Active Waitlist Entries ({len(waitlist_df[waitlist_df['status'] == 'Waiting'])} waiting)")

        # Filter options
        col_filter1, col_filter2 = st.columns(2)
        with col_filter1:
            status_filter_wl = st.multiselect(
                "Filter by Status",
                ["Waiting", "Notified", "Converted", "Cancelled"],
                default=["Waiting"],
                key="waitlist_status_filter"
            )
        with col_filter2:
            date_filter_wl = st.date_input("Filter by Date Range", value=None, key="waitlist_date_filter")

        # Apply filters
        filtered_waitlist = waitlist_df.copy()
        if status_filter_wl:
            filtered_waitlist = filtered_waitlist[filtered_waitlist['status'].isin(status_filter_wl)]
        if date_filter_wl:
            if isinstance(date_filter_wl, tuple) and len(date_filter_wl) == 2:
                filtered_waitlist = filtered_waitlist[
                    (filtered_waitlist['requested_date'] >= pd.to_datetime(date_filter_wl[0])) &
                    (filtered_waitlist['requested_date'] <= pd.to_datetime(date_filter_wl[1]))
                ]

        # Display waitlist cards
        for idx, entry in filtered_waitlist.iterrows():
            status_color = {
                'Waiting': '#f59e0b',
                'Notified': '#3b82f6',
                'Converted': '#10b981',
                'Cancelled': '#6b7280'
            }.get(entry['status'], '#94a3b8')

            card_html = f"""
                <div style='background: linear-gradient(135deg, #2B4048 0%, #5a6f85 100%); border: 2px solid {status_color}; border-radius: 12px; padding: 1.5rem; margin-bottom: 1rem;'>
                    <div style='display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;'>
                        <div>
                            <div style='color: #F6F3EC; font-size: 1.125rem; font-weight: 600;'>{entry['waitlist_id']}</div>
                            <div style='color: #E0D5BE; font-size: 0.875rem; margin-top: 0.25rem;'>{entry['guest_email']}</div>
                            {f"<div style='color: #e8e3d9; font-size: 0.875rem;'>{entry['guest_name']}</div>" if entry.get('guest_name') else ""}
                        </div>
                        <div style='background: {status_color}; color: #ffffff; padding: 0.5rem 1rem; border-radius: 6px; font-weight: 600; font-size: 0.875rem;'>
                            {entry['status']}
                        </div>
                    </div>
                    <div style='display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom: 1rem;'>
                        <div>
                            <div style='color: #E0D5BE; font-size: 0.75rem; font-weight: 600; text-transform: uppercase;'>Date</div>
                            <div style='color: #F6F3EC; font-weight: 600;'>{entry['requested_date'].strftime('%b %d, %Y') if pd.notna(entry['requested_date']) else 'Not Set'}</div>
                        </div>
                        <div>
                            <div style='color: #E0D5BE; font-size: 0.75rem; font-weight: 600; text-transform: uppercase;'>Time</div>
                            <div style='color: #F6F3EC; font-weight: 600;'>{entry.get('preferred_time', 'Flexible')}</div>
                        </div>
                        <div>
                            <div style='color: #E0D5BE; font-size: 0.75rem; font-weight: 600; text-transform: uppercase;'>Players</div>
                            <div style='color: #F6F3EC; font-weight: 600;'>{entry['players']}</div>
                        </div>
                        <div>
                            <div style='color: #E0D5BE; font-size: 0.75rem; font-weight: 600; text-transform: uppercase;'>Priority</div>
                            <div style='color: #F6F3EC; font-weight: 600;'>{entry['priority']}/10</div>
                        </div>
                    </div>
                    {f"<div style='background: #2d3e4f; padding: 0.75rem; border-radius: 6px; margin-top: 1rem;'><div style='color: #E0D5BE; font-size: 0.7rem; font-weight: 600; text-transform: uppercase; margin-bottom: 0.5rem;'>Notes</div><div style='color: #e8e3d9; font-size: 0.875rem;'>{entry['notes']}</div></div>" if entry.get('notes') else ""}
                </div>
            """
            st.markdown(card_html, unsafe_allow_html=True)

            # Action buttons
            col_btn1, col_btn2, col_btn3, col_btn4 = st.columns(4)
            with col_btn1:
                if entry['status'] == 'Waiting':
                    if st.button("Mark as Notified", key=f"notify_{entry['waitlist_id']}", use_container_width=True):
                        if update_waitlist_status(entry['waitlist_id'], 'Notified', send_notification=True):
                            st.success("Marked as notified!")
                            st.cache_data.clear()
                            st.rerun()
            with col_btn2:
                if entry['status'] in ['Waiting', 'Notified']:
                    if st.button("Convert to Booking", key=f"convert_{entry['waitlist_id']}", use_container_width=True):
                        st.session_state[f"show_convert_{entry['waitlist_id']}"] = True
                        st.rerun()
            with col_btn3:
                if entry['status'] == 'Waiting':
                    if st.button("Cancel", key=f"cancel_wl_{entry['waitlist_id']}", use_container_width=True):
                        if update_waitlist_status(entry['waitlist_id'], 'Cancelled'):
                            st.success("Waitlist entry cancelled")
                            st.cache_data.clear()
                            st.rerun()
            with col_btn4:
                if st.button("Delete", key=f"delete_wl_{entry['waitlist_id']}", use_container_width=True):
                    if delete_waitlist_entry(entry['waitlist_id']):
                        st.success("Waitlist entry deleted")
                        st.cache_data.clear()
                        st.rerun()

            # Show conversion form if requested
            if st.session_state.get(f"show_convert_{entry['waitlist_id']}", False):
                with st.form(f"convert_form_{entry['waitlist_id']}"):
                    st.markdown("#### Convert to Booking")
                    tee_time_conv = st.text_input("Tee Time", value=entry.get('preferred_time', ''))
                    total_amount = st.number_input("Total Amount", min_value=0.0, value=0.0)
                    col_conv1, col_conv2 = st.columns(2)
                    with col_conv1:
                        submit_conv = st.form_submit_button("Confirm Conversion", use_container_width=True)
                    with col_conv2:
                        cancel_conv = st.form_submit_button("Cancel", use_container_width=True)
                    if submit_conv:
                        success, booking_id = convert_waitlist_to_booking(entry, tee_time_conv, total_amount)
                        if success:
                            st.success(f"Converted to booking! Booking ID: {booking_id}")
                            st.session_state[f"show_convert_{entry['waitlist_id']}"] = False
                            st.cache_data.clear()
                            st.rerun()
                    if cancel_conv:
                        st.session_state[f"show_convert_{entry['waitlist_id']}"] = False
                        st.rerun()

# ========================================
# MARKETING SEGMENTATION VIEW
# ========================================
elif page == "Marketing Segmentation":
    st.markdown("""
        <h2 style='margin-bottom: 0.5rem;'>Marketing Segmentation</h2>
        <p style='color: #E0D5BE; margin-bottom: 1.5rem;'>Customer segments and targeted marketing opportunities</p>
    """, unsafe_allow_html=True)

    # Load bookings for segmentation
    df, source = load_bookings_from_db(st.session_state.customer_id)

    if df.empty:
        st.info("No booking data available for segmentation")
        st.stop()

    # Calculate segments
    segments_df = identify_marketing_segments(df)

    # Summary metrics
    st.markdown("### Segment Overview")
    seg_col1, seg_col2, seg_col3, seg_col4 = st.columns(4)

    with seg_col1:
        high_value = len(segments_df[segments_df['Segment'] == 'High-Value Customer'])
        st.markdown(f"""
            <div style='background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 12px; padding: 1.5rem; text-align: center;'>
                <div style='color: #ffffff; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; margin-bottom: 0.5rem;'>High-Value Customers</div>
                <div style='color: #ffffff; font-size: 2.5rem; font-weight: 700;'>{high_value}</div>
            </div>
        """, unsafe_allow_html=True)

    with seg_col2:
        freq_non_bookers = len(segments_df[segments_df['Segment'] == 'Frequent Non-Booker'])
        st.markdown(f"""
            <div style='background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); border-radius: 12px; padding: 1.5rem; text-align: center;'>
                <div style='color: #ffffff; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; margin-bottom: 0.5rem;'>Frequent Non-Bookers</div>
                <div style='color: #ffffff; font-size: 2.5rem; font-weight: 700;'>{freq_non_bookers}</div>
            </div>
        """, unsafe_allow_html=True)

    with seg_col3:
        repeat_inquirers = len(segments_df[segments_df['Segment'] == 'Repeat Inquirer'])
        st.markdown(f"""
            <div style='background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); border-radius: 12px; padding: 1.5rem; text-align: center;'>
                <div style='color: #ffffff; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; margin-bottom: 0.5rem;'>Repeat Inquirers</div>
                <div style='color: #ffffff; font-size: 2.5rem; font-weight: 700;'>{repeat_inquirers}</div>
            </div>
        """, unsafe_allow_html=True)

    with seg_col4:
        converted = len(segments_df[segments_df['Segment'] == 'Converted Customer'])
        st.markdown(f"""
            <div style='background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); border-radius: 12px; padding: 1.5rem; text-align: center;'>
                <div style='color: #ffffff; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; margin-bottom: 0.5rem;'>Converted Customers</div>
                <div style='color: #ffffff; font-size: 2.5rem; font-weight: 700;'>{converted}</div>
            </div>
        """, unsafe_allow_html=True)

    st.markdown("<div style='height: 2px; background: #6B7F4E; margin: 2rem 0;'></div>", unsafe_allow_html=True)

    # Filter by segment
    st.markdown("### Detailed Segment Analysis")
    segment_filter = st.multiselect(
        "Filter by Segment",
        segments_df['Segment'].unique().tolist(),
        default=segments_df['Segment'].unique().tolist(),
        key="segment_filter"
    )

    filtered_segments = segments_df[segments_df['Segment'].isin(segment_filter)]

    # Display segments
    for _, segment in filtered_segments.iterrows():
        priority_color = {
            'VIP': '#10b981',
            'High': '#ef4444',
            'Medium': '#f59e0b',
            'Standard': '#3b82f6',
            'Low': '#6b7280'
        }.get(segment['Priority'], '#94a3b8')

        # Escape all text fields for safe HTML rendering
        customer_email = html.escape(str(segment['Customer Email']))
        segment_name = html.escape(str(segment['Segment']))
        priority = html.escape(str(segment['Priority']))
        recommended_action = html.escape(str(segment['Recommended Action']))

        card_html = f"""
            <div style='background: linear-gradient(135deg, #2B4048 0%, #5a6f85 100%); border: 2px solid {priority_color}; border-radius: 12px; padding: 1.5rem; margin-bottom: 1rem;'>
                <div style='display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;'>
                    <div>
                        <div style='color: #F6F3EC; font-size: 1.125rem; font-weight: 600;'>{customer_email}</div>
                        <div style='color: #E0D5BE; font-size: 0.875rem; margin-top: 0.25rem;'>{segment_name}</div>
                    </div>
                    <div style='background: {priority_color}; color: #ffffff; padding: 0.5rem 1rem; border-radius: 6px; font-weight: 600; font-size: 0.875rem;'>
                        {priority} Priority
                    </div>
                </div>
                <div style='display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom: 1rem;'>
                    <div>
                        <div style='color: #E0D5BE; font-size: 0.75rem; font-weight: 600; text-transform: uppercase;'>Total Contacts</div>
                        <div style='color: #F6F3EC; font-weight: 600; font-size: 1.25rem;'>{int(segment['Total Contacts'])}</div>
                    </div>
                    <div>
                        <div style='color: #E0D5BE; font-size: 0.75rem; font-weight: 600; text-transform: uppercase;'>Bookings</div>
                        <div style='color: #F6F3EC; font-weight: 600; font-size: 1.25rem;'>{int(segment['Completed Bookings'])}</div>
                    </div>
                    <div>
                        <div style='color: #E0D5BE; font-size: 0.75rem; font-weight: 600; text-transform: uppercase;'>Revenue</div>
                        <div style='color: #10b981; font-weight: 700; font-size: 1.25rem;'>{CURRENCY_SYMBOL}{segment['Total Revenue']:,.0f}</div>
                    </div>
                    <div>
                        <div style='color: #E0D5BE; font-size: 0.75rem; font-weight: 600; text-transform: uppercase;'>Last Contact</div>
                        <div style='color: #F6F3EC; font-weight: 600;'>{segment['Last Contact'].strftime('%b %d, %Y') if pd.notna(segment['Last Contact']) else 'N/A'}</div>
                    </div>
                </div>
                <div style='background: #2d3e4f; padding: 0.75rem; border-radius: 6px;'>
                    <div style='color: #E0D5BE; font-size: 0.7rem; font-weight: 600; text-transform: uppercase; margin-bottom: 0.5rem;'>Recommended Action</div>
                    <div style='color: #e8e3d9; font-size: 0.875rem;'>{recommended_action}</div>
                </div>
            </div>
        """
        st.markdown(card_html, unsafe_allow_html=True)

    # Export segments
    st.markdown("<div style='height: 2px; background: #6B7F4E; margin: 2rem 0;'></div>", unsafe_allow_html=True)
    st.markdown("### Export Segments")

    col_exp1, col_exp2 = st.columns(2)
    with col_exp1:
        if st.button("Export All Segments (CSV)", use_container_width=True, key="export_all_segments"):
            csv_data = filtered_segments.to_csv(index=False)
            st.download_button(
                label="Download CSV",
                data=csv_data,
                file_name=f"marketing_segments_{datetime.now().strftime('%Y%m%d')}.csv",
                mime="text/csv",
                use_container_width=True,
                key="download_segments_csv"
            )

    with col_exp2:
        if st.button("Export High Priority Only", use_container_width=True, key="export_high_priority"):
            high_priority = filtered_segments[filtered_segments['Priority'].isin(['VIP', 'High'])]
            csv_data = high_priority.to_csv(index=False)
            st.download_button(
                label="Download High Priority CSV",
                data=csv_data,
                file_name=f"high_priority_segments_{datetime.now().strftime('%Y%m%d')}.csv",
                mime="text/csv",
                use_container_width=True,
                key="download_high_priority_csv"
            )

# ========================================
# NOTIFY INTEGRATION VIEW
# ========================================
elif page == "Notify Integration":
    st.markdown("""
        <h2 style='margin-bottom: 0.5rem;'>Notify Platform Integration</h2>
        <p style='color: #E0D5BE; margin-bottom: 1.5rem;'>Export and sync booking data with external notification platforms</p>
    """, unsafe_allow_html=True)

    # Load bookings
    df, source = load_bookings_from_db(st.session_state.customer_id)

    if df.empty:
        st.info("No booking data available for export")
        st.stop()

    # Statistics
    st.markdown("### Export Statistics")
    col_stat1, col_stat2, col_stat3 = st.columns(3)

    with col_stat1:
        st.markdown(f"""
            <div style='background: linear-gradient(135deg, #2B4048 0%, #5a6f85 100%); border: 2px solid #E0D5BE; border-radius: 12px; padding: 1.5rem; text-align: center;'>
                <div style='color: #E0D5BE; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; margin-bottom: 0.5rem;'>Total Records</div>
                <div style='color: #F6F3EC; font-size: 2.5rem; font-weight: 700;'>{len(df)}</div>
            </div>
        """, unsafe_allow_html=True)

    with col_stat2:
        confirmed_count = len(df[df['status'].isin(['Confirmed', 'Booked'])])
        st.markdown(f"""
            <div style='background: linear-gradient(135deg, #10b981 0%, #059669 100%); border: 2px solid #10b981; border-radius: 12px; padding: 1.5rem; text-align: center;'>
                <div style='color: #ffffff; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; margin-bottom: 0.5rem;'>Confirmed Bookings</div>
                <div style='color: #ffffff; font-size: 2.5rem; font-weight: 700;'>{confirmed_count}</div>
            </div>
        """, unsafe_allow_html=True)

    with col_stat3:
        last_export = datetime.now().strftime('%b %d, %Y %I:%M %p')
        st.markdown(f"""
            <div style='background: linear-gradient(135deg, #2B4048 0%, #5a6f85 100%); border: 2px solid #E0D5BE; border-radius: 12px; padding: 1.5rem; text-align: center;'>
                <div style='color: #E0D5BE; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; margin-bottom: 0.5rem;'>Last Export</div>
                <div style='color: #F6F3EC; font-size: 0.875rem; font-weight: 600;'>{last_export}</div>
            </div>
        """, unsafe_allow_html=True)

    st.markdown("<div style='height: 2px; background: #6B7F4E; margin: 2rem 0;'></div>", unsafe_allow_html=True)

    # Export Options
    st.markdown("### Export Options")

    # JSON Export
    with st.expander("JSON Export", expanded=False):
        st.markdown("Export booking data in JSON format for API integration")
        if st.button("Generate JSON", key="gen_json", use_container_width=True):
            json_data = export_to_json(df)
            st.download_button(
                label="Download JSON File",
                data=json_data,
                file_name=f"bookings_export_{datetime.now().strftime('%Y%m%d')}.json",
                mime="application/json",
                use_container_width=True,
                key="download_json"
            )
            with st.expander("Preview JSON"):
                st.code(json_data[:500] + "...", language="json")

    # CSV Export for Notify
    with st.expander("CSV Export (Notify Format)", expanded=False):
        st.markdown("Export booking data in CSV format optimized for Notify platform import")
        if st.button("Generate Notify CSV", key="gen_csv", use_container_width=True):
            csv_data = export_notify_csv(df)
            st.download_button(
                label="Download Notify CSV",
                data=csv_data,
                file_name=f"notify_bookings_{datetime.now().strftime('%Y%m%d')}.csv",
                mime="text/csv",
                use_container_width=True,
                key="download_notify_csv"
            )

    # API Push
    with st.expander("Push to Notify API", expanded=False):
        st.markdown("Send booking data directly to Notify platform via API")
        with st.form("api_push_form"):
            api_endpoint = st.text_input("API Endpoint URL", placeholder="https://api.notify-platform.com/bookings")
            api_key = st.text_input("API Key (Optional)", type="password", placeholder="Your API key")

            # Filter options
            st.markdown("#### Filter Options")
            status_filter_api = st.multiselect(
                "Export Status",
                ["Inquiry", "Requested", "Confirmed", "Booked", "Rejected", "Cancelled"],
                default=["Confirmed", "Booked"],
                key="api_status_filter"
            )

            submit_api = st.form_submit_button("Push to API", use_container_width=True)

            if submit_api:
                if not api_endpoint:
                    st.error("Please provide an API endpoint URL")
                else:
                    # Filter data
                    filtered_df = df[df['status'].isin(status_filter_api)] if status_filter_api else df

                    with st.spinner("Pushing data to Notify platform..."):
                        success, message = push_to_notify_api(filtered_df, api_endpoint, api_key)

                        if success:
                            st.success(message)
                        else:
                            st.error(message)

    st.markdown("<div style='height: 2px; background: #6B7F4E; margin: 2rem 0;'></div>", unsafe_allow_html=True)

    # Preview Export Data
    st.markdown("### Preview Export Data")
    preview_count = st.slider("Number of records to preview", min_value=5, max_value=50, value=10, key="preview_count")

    export_preview = prepare_booking_data_for_export(df.head(preview_count))
    preview_df = pd.DataFrame(export_preview)

    st.dataframe(preview_df, use_container_width=True)


# ========================================
# CUSTOMER JOURNEY EMAILS VIEW
# ========================================
elif page == "Customer Journey Emails":
    render_customer_journey_page()
