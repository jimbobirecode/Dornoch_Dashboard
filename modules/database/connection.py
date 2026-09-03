"""Database connection utilities"""
import os
import psycopg
from psycopg.rows import dict_row

from club_config import pg_connect_kwargs


def get_db_connection():
    """
    Get database connection using DATABASE_URL environment variable

    Returns:
        psycopg.Connection: Database connection object

    Raises:
        ValueError: If DATABASE_URL environment variable is not set
    """
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise ValueError("DATABASE_URL environment variable not set")
    return psycopg.connect(database_url, **pg_connect_kwargs(database_url))


def execute_query(query, params=None, fetch_one=False, fetch_all=True):
    """
    Execute a database query with automatic connection handling

    Args:
        query (str): SQL query to execute
        params (tuple, optional): Query parameters
        fetch_one (bool): Fetch single row
        fetch_all (bool): Fetch all rows

    Returns:
        Result of query execution or None
    """
    conn = get_db_connection()
    cursor = conn.cursor(row_factory=dict_row)

    try:
        cursor.execute(query, params)

        if fetch_one:
            result = cursor.fetchone()
        elif fetch_all:
            result = cursor.fetchall()
        else:
            conn.commit()
            result = cursor.rowcount

        return result
    finally:
        cursor.close()
        conn.close()
