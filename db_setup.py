#!/usr/bin/env python3
"""
Database Setup and Diagnostic Tool for TeeMail Dashboard
"""
import sys
import bcrypt

def test_connection(db_url):
    """Test database connection"""
    print("🔌 Testing database connection...")
    try:
        import psycopg
        conn = psycopg.connect(db_url)
        print("✅ Successfully connected to database!")
        conn.close()
        return True
    except Exception as e:
        print(f"❌ Connection failed: {e}")
        return False

def check_tables(db_url):
    """Check if required tables exist"""
    print("\n📋 Checking database tables...")
    try:
        import psycopg
        from psycopg.rows import dict_row

        conn = psycopg.connect(db_url)
        cursor = conn.cursor(row_factory=dict_row)

        # Check for dashboard_users table
        cursor.execute("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_name = 'dashboard_users'
            );
        """)
        users_table_exists = cursor.fetchone()['exists']

        # Check for bookings table
        cursor.execute("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_name = 'bookings'
            );
        """)
        bookings_table_exists = cursor.fetchone()['exists']

        print(f"   dashboard_users: {'✅ Exists' if users_table_exists else '❌ Missing'}")
        print(f"   bookings: {'✅ Exists' if bookings_table_exists else '❌ Missing'}")

        cursor.close()
        conn.close()

        return users_table_exists, bookings_table_exists

    except Exception as e:
        print(f"❌ Error checking tables: {e}")
        return False, False

def create_tables(db_url):
    """Create required tables"""
    print("\n🛠️  Creating database tables...")
    try:
        import psycopg
        conn = psycopg.connect(db_url)
        cursor = conn.cursor()

        # Create dashboard_users table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS dashboard_users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(255),
                temp_password VARCHAR(255),
                customer_id VARCHAR(255) NOT NULL,
                full_name VARCHAR(255),
                is_active BOOLEAN DEFAULT TRUE,
                must_change_password BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_login TIMESTAMP,
                password_changed_at TIMESTAMP
            );
        """)
        print("✅ Created dashboard_users table")

        # Create bookings table if it doesn't exist
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS bookings (
                id SERIAL PRIMARY KEY,
                booking_id VARCHAR(255) UNIQUE NOT NULL,
                guest_email VARCHAR(255) NOT NULL,
                date DATE NOT NULL,
                tee_time VARCHAR(50),
                players INTEGER NOT NULL,
                total DECIMAL(10, 2) NOT NULL,
                status VARCHAR(50) DEFAULT 'Pending',
                note TEXT,
                club VARCHAR(255) NOT NULL,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                customer_confirmed_at TIMESTAMP,
                updated_at TIMESTAMP,
                updated_by VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        print("✅ Created bookings table")

        # Create index on booking_id
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_booking_id ON bookings(booking_id);
        """)
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_club ON bookings(club);
        """)
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_status ON bookings(status);
        """)

        conn.commit()
        cursor.close()
        conn.close()

        print("✅ All tables created successfully!")
        return True

    except Exception as e:
        print(f"❌ Error creating tables: {e}")
        return False

def list_users(db_url):
    """List all users in the database"""
    print("\n👥 Checking for existing users...")
    try:
        import psycopg
        from psycopg.rows import dict_row

        conn = psycopg.connect(db_url)
        cursor = conn.cursor(row_factory=dict_row)

        cursor.execute("""
            SELECT username, customer_id, full_name, temp_password,
                   is_active, must_change_password
            FROM dashboard_users
            ORDER BY id;
        """)
        users = cursor.fetchall()

        if users:
            print(f"\n{'='*70}")
            print("EXISTING USERS")
            print(f"{'='*70}")
            for user in users:
                print(f"\n👤 Username: {user['username']}")
                print(f"   Full Name: {user['full_name'] or 'Not set'}")
                print(f"   Customer: {user['customer_id']}")
                print(f"   Active: {'✅ Yes' if user['is_active'] else '❌ No'}")
                if user['must_change_password'] and user['temp_password']:
                    print(f"   🔑 Temp Password: {user['temp_password']}")
                    print(f"   ⚠️  Status: Must change password on first login")
                else:
                    print(f"   ✅ Status: Password configured")
                print(f"{'-'*70}")
        else:
            print("   No users found")

        cursor.close()
        conn.close()
        return len(users) > 0

    except Exception as e:
        print(f"❌ Error listing users: {e}")
        return False

def create_user(db_url, username, temp_password, customer_id, full_name):
    """Create a new user"""
    print(f"\n👤 Creating user '{username}'...")
    try:
        import psycopg

        conn = psycopg.connect(db_url)
        cursor = conn.cursor()

        cursor.execute("""
            INSERT INTO dashboard_users (
                username, temp_password, customer_id, full_name,
                is_active, must_change_password
            ) VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (username) DO NOTHING;
        """, (username, temp_password, customer_id, full_name, True, True))

        if cursor.rowcount > 0:
            print(f"✅ User created successfully!")
            print(f"\n{'='*70}")
            print(f"LOGIN CREDENTIALS")
            print(f"{'='*70}")
            print(f"Username: {username}")
            print(f"Password: {temp_password}")
            print(f"Customer: {customer_id}")
            print(f"{'='*70}")
            print(f"\n⚠️  You will be prompted to set a permanent password on first login")
        else:
            print(f"⚠️  User '{username}' already exists")

        conn.commit()
        cursor.close()
        conn.close()
        return True

    except Exception as e:
        print(f"❌ Error creating user: {e}")
        return False

def main():
    print("="*70)
    print("TeeMail Dashboard - Database Setup Tool")
    print("="*70)

    # Get database URL
    print("\nEnter your DATABASE_URL from Render:")
    print("(It should look like: postgresql://user:pass@host.render.com/dbname)")
    print("(Or press Enter to use default from environment)")

    db_url_input = input("\nDATABASE_URL: ").strip()

    if db_url_input:
        db_url = db_url_input
    else:
        import os
        db_url = os.getenv("DATABASE_URL")
        if not db_url:
            print("❌ No DATABASE_URL provided or found in environment")
            sys.exit(1)

    # Test connection
    if not test_connection(db_url):
        print("\n⚠️  Database connection failed!")
        print("\nCommon issues:")
        print("1. Incomplete hostname - should end with .render.com or .oregon-postgres.render.com")
        print("2. Wrong credentials")
        print("3. Database not accessible from this location")
        print("\nIn Render Dashboard:")
        print("- Go to your PostgreSQL database")
        print("- Copy the 'Internal Database URL' or 'External Database URL'")
        print("- Make sure it includes the full hostname")
        sys.exit(1)

    # Check tables
    users_exist, bookings_exist = check_tables(db_url)

    if not users_exist or not bookings_exist:
        print("\n⚠️  Some tables are missing. Create them now? (y/n)")
        response = input("Create tables: ").strip().lower()
        if response == 'y':
            create_tables(db_url)
        else:
            print("⚠️  Tables not created. Dashboard won't work without them.")
            sys.exit(1)

    # List existing users
    has_users = list_users(db_url)

    if not has_users:
        print("\n⚠️  No users found. Would you like to create a user? (y/n)")
        response = input("Create user: ").strip().lower()
        if response == 'y':
            print("\nEnter user details:")
            username = input("Username: ").strip()
            temp_password = input("Temporary Password: ").strip()
            print("\nAvailable customers: streamsong, skerries, baltray, ardglass")
            customer_id = input("Customer ID: ").strip()
            full_name = input("Full Name: ").strip()

            create_user(db_url, username, temp_password, customer_id, full_name)
    else:
        print("\n✅ Users already exist. You can use the credentials shown above to login.")

    print("\n" + "="*70)
    print("Setup complete! You can now use the dashboard.")
    print("="*70)

if __name__ == "__main__":
    main()
