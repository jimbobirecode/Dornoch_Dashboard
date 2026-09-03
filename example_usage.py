"""
Example: How to use Royal Dornoch Dashboard modules in a new project

This demonstrates how to import and use the modular components
in your own booking management dashboard.
"""

import streamlit as st
import pandas as pd
from datetime import datetime

# Import authentication modules
from modules.auth import authenticate_user, update_last_login

# Import database modules
from modules.database import (
    load_bookings_from_db,
    update_booking_status,
    update_booking_note
)

# Import UI modules
from modules.ui import DORNOCH_COLORS, get_dashboard_css

# Import utility modules
from modules.utils import (
    extract_tee_time_from_note,
    generate_status_progress_bar
)


def main():
    """Main application"""

    # Configure page
    st.set_page_config(
        page_title="My Booking Dashboard",
        page_icon="🏌️",
        layout="wide"
    )

    # Apply Royal Dornoch styling
    st.markdown(get_dashboard_css(), unsafe_allow_html=True)

    # Initialize session state
    if 'authenticated' not in st.session_state:
        st.session_state.authenticated = False

    # Authentication flow
    if not st.session_state.authenticated:
        show_login_screen()
    else:
        show_dashboard()


def show_login_screen():
    """Display login screen"""
    st.title("Login")

    with st.form("login_form"):
        username = st.text_input("Username")
        password = st.text_input("Password", type="password")
        submit = st.form_submit_button("Login")

        if submit and username and password:
            success, customer_id, full_name, must_change, user_id = authenticate_user(
                username, password
            )

            if success:
                st.session_state.authenticated = True
                st.session_state.customer_id = customer_id
                st.session_state.full_name = full_name
                st.session_state.user_id = user_id
                st.session_state.username = username

                update_last_login(user_id)
                st.success("Login successful!")
                st.rerun()
            else:
                st.error("Invalid credentials")


def show_dashboard():
    """Display main dashboard"""

    # Header
    st.title(f"Welcome, {st.session_state.full_name}!")

    # Logout button
    if st.button("Logout"):
        st.session_state.clear()
        st.rerun()

    # Load bookings
    df, source = load_bookings_from_db(st.session_state.customer_id)

    if df.empty:
        st.info("No bookings found")
        return

    # Display booking count
    st.metric("Total Bookings", len(df))

    # Filters
    st.sidebar.title("Filters")
    status_options = df['status'].unique().tolist()
    selected_statuses = st.sidebar.multiselect(
        "Status",
        status_options,
        default=status_options
    )

    # Filter dataframe
    filtered_df = df[df['status'].isin(selected_statuses)]

    st.divider()

    # Display bookings
    for idx, booking in filtered_df.iterrows():
        with st.container():
            # Header
            col1, col2 = st.columns([3, 1])
            with col1:
                st.subheader(f"📋 {booking['booking_id']}")
                st.text(f"📧 {booking['guest_email']}")
            with col2:
                st.metric("Total", f"${booking['total']:.2f}")

            # Progress bar
            progress_html = generate_status_progress_bar(booking['status'])
            st.markdown(progress_html, unsafe_allow_html=True)

            # Booking details
            col1, col2, col3 = st.columns(3)
            with col1:
                st.write("**Date:**", booking['date'].strftime('%b %d, %Y'))
            with col2:
                st.write("**Time:**", booking.get('tee_time', 'Not specified'))
            with col3:
                st.write("**Players:**", booking['players'])

            # Status management buttons
            st.write("**Change Status:**")
            btn_cols = st.columns(5)

            current_status = booking['status']

            with btn_cols[0]:
                if current_status != 'Inquiry':
                    if st.button("← Inquiry", key=f"inq_{idx}"):
                        update_booking_status(
                            booking['booking_id'],
                            'Inquiry',
                            st.session_state.username
                        )
                        st.rerun()

            with btn_cols[1]:
                if current_status != 'Requested':
                    if st.button("→ Requested", key=f"req_{idx}"):
                        update_booking_status(
                            booking['booking_id'],
                            'Requested',
                            st.session_state.username
                        )
                        st.rerun()

            with btn_cols[2]:
                if current_status != 'Confirmed':
                    if st.button("→ Confirmed", key=f"conf_{idx}"):
                        update_booking_status(
                            booking['booking_id'],
                            'Confirmed',
                            st.session_state.username
                        )
                        st.rerun()

            with btn_cols[3]:
                if current_status != 'Booked':
                    if st.button("→ Booked", key=f"book_{idx}"):
                        update_booking_status(
                            booking['booking_id'],
                            'Booked',
                            st.session_state.username
                        )
                        st.rerun()

            with btn_cols[4]:
                if current_status not in ['Rejected', 'Cancelled']:
                    if st.button("✕ Reject", key=f"rej_{idx}"):
                        update_booking_status(
                            booking['booking_id'],
                            'Rejected',
                            st.session_state.username
                        )
                        st.rerun()

            # Notes section
            with st.expander("📝 View/Edit Notes"):
                note_content = str(booking.get('note', 'No notes'))
                updated_note = st.text_area(
                    "Notes",
                    value=note_content,
                    height=150,
                    key=f"note_{idx}"
                )

                if updated_note != note_content:
                    if st.button("💾 Save", key=f"save_{idx}"):
                        update_booking_note(booking['booking_id'], updated_note)
                        st.success("Note saved!")
                        st.rerun()

            st.divider()


if __name__ == "__main__":
    main()
