"""
Debug script for Customer Journey Emails
Run this to see what data is being retrieved and sent to SendGrid
"""

import os
import sys
from datetime import datetime, timedelta
from psycopg.rows import dict_row

# Add parent directory to path
sys.path.insert(0, '/home/user/dornoch_dashboard')

from modules.database.connection import get_db_connection

def test_upcoming_bookings():
    """Test what data we're getting for upcoming bookings"""
    print("=" * 60)
    print("TESTING UPCOMING BOOKINGS (3 days ahead)")
    print("=" * 60)

    conn = get_db_connection()
    cursor = conn.cursor(row_factory=dict_row)

    target_date = (datetime.now() + timedelta(days=3)).date()
    print(f"\nTarget date: {target_date}")

    cursor.execute("""
        SELECT
            id,
            booking_id,
            guest_email,
            date as play_date,
            tee_time,
            players,
            golf_courses,
            pre_arrival_email_sent_at
        FROM bookings
        WHERE status = 'Confirmed'
        AND date = %s
        ORDER BY tee_time
    """, (target_date,))

    bookings = cursor.fetchall()

    print(f"\nFound {len(bookings)} bookings")
    print("-" * 60)

    for i, booking in enumerate(bookings, 1):
        print(f"\n📧 Booking {i}:")
        print(f"   Booking ID: {booking['booking_id']}")
        print(f"   Email: {booking['guest_email']}")
        print(f"   Date: {booking['play_date']}")
        print(f"   Tee Time: {booking.get('tee_time', 'N/A')}")
        print(f"   Players: {booking['players']}")
        print(f"   Course: {booking.get('golf_courses', 'N/A')}")
        print(f"   Email Sent: {booking['pre_arrival_email_sent_at']}")

        # Show what would be sent to SendGrid
        play_date = booking['play_date']
        if hasattr(play_date, 'strftime'):
            formatted_date = play_date.strftime('%A, %B %d, %Y')
        else:
            formatted_date = str(play_date)

        print(f"\n   📨 SendGrid Data:")
        print(f"      {{{{guest_name}}}}: {booking['guest_email'].split('@')[0].title()}")
        print(f"      {{{{date}}}}: {formatted_date}")
        print(f"      {{{{course}}}}: {booking.get('golf_courses', 'Royal Dornoch Golf Club')}")
        print(f"      {{{{tee_time}}}}: {booking.get('tee_time', 'TBD')}")
        print(f"      {{{{players}}}}: {booking['players']}")
        print(f"      {{{{booking_ref}}}}: {booking['booking_id']}")

    cursor.close()
    conn.close()


def test_recent_bookings():
    """Test what data we're getting for recent bookings"""
    print("\n\n" + "=" * 60)
    print("TESTING RECENT BOOKINGS (2 days ago)")
    print("=" * 60)

    conn = get_db_connection()
    cursor = conn.cursor(row_factory=dict_row)

    target_date = (datetime.now() - timedelta(days=2)).date()
    print(f"\nTarget date: {target_date}")

    cursor.execute("""
        SELECT
            id,
            booking_id,
            guest_email,
            date as play_date,
            tee_time,
            players,
            golf_courses,
            post_play_email_sent_at
        FROM bookings
        WHERE status = 'Confirmed'
        AND date = %s
        ORDER BY guest_email
    """, (target_date,))

    bookings = cursor.fetchall()

    print(f"\nFound {len(bookings)} bookings")
    print("-" * 60)

    for i, booking in enumerate(bookings, 1):
        print(f"\n📧 Booking {i}:")
        print(f"   Booking ID: {booking['booking_id']}")
        print(f"   Email: {booking['guest_email']}")
        print(f"   Date: {booking['play_date']}")
        print(f"   Tee Time: {booking.get('tee_time', 'N/A')}")
        print(f"   Players: {booking['players']}")
        print(f"   Course: {booking.get('golf_courses', 'N/A')}")
        print(f"   Email Sent: {booking['post_play_email_sent_at']}")

        # Show what would be sent to SendGrid
        play_date = booking['play_date']
        if hasattr(play_date, 'strftime'):
            formatted_date = play_date.strftime('%A, %B %d, %Y')
        else:
            formatted_date = str(play_date)

        print(f"\n   📨 SendGrid Data:")
        print(f"      {{{{guest_name}}}}: {booking['guest_email'].split('@')[0].title()}")
        print(f"      {{{{date}}}}: {formatted_date}")
        print(f"      {{{{course}}}}: {booking.get('golf_courses', 'Royal Dornoch Golf Club')}")
        print(f"      {{{{tee_time}}}}: {booking.get('tee_time', 'TBD')}")
        print(f"      {{{{players}}}}: {booking['players']}")
        print(f"      {{{{booking_ref}}}}: {booking['booking_id']}")

    cursor.close()
    conn.close()


def check_all_confirmed_bookings():
    """Check all confirmed bookings to see date distribution"""
    print("\n\n" + "=" * 60)
    print("ALL CONFIRMED BOOKINGS")
    print("=" * 60)

    conn = get_db_connection()
    cursor = conn.cursor(row_factory=dict_row)

    cursor.execute("""
        SELECT
            booking_id,
            guest_email,
            date,
            tee_time,
            players,
            golf_courses,
            status
        FROM bookings
        WHERE status = 'Confirmed'
        ORDER BY date
        LIMIT 20
    """)

    bookings = cursor.fetchall()

    print(f"\nFound {len(bookings)} confirmed bookings")
    print("-" * 60)

    for booking in bookings:
        print(f"{booking['date']} | {booking['booking_id']} | {booking['guest_email']} | {booking.get('golf_courses', 'N/A')}")

    cursor.close()
    conn.close()


if __name__ == "__main__":
    print("\n🔍 CUSTOMER JOURNEY EMAIL DEBUG SCRIPT\n")

    try:
        test_upcoming_bookings()
        test_recent_bookings()
        check_all_confirmed_bookings()

        print("\n\n" + "=" * 60)
        print("✅ DEBUG COMPLETE")
        print("=" * 60)
        print("\nIf you see 'Found 0 bookings', you need to:")
        print("1. Load test data: psql $DATABASE_URL < test_data_journey_emails.sql")
        print("2. Or check that your bookings have status='Confirmed'")
        print("3. Or adjust the dates in your existing bookings")

    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
