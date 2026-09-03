"""Helper utility functions"""
import re
import pandas as pd


def extract_tee_time_from_note(note_content):
    """
    Extract tee time from email content.
    Looks for patterns like:
    - Time: 12:20 PM
    - Time: 10:30 AM
    - Tee Time: 3:45 PM

    Args:
        note_content (str): Note/email content

    Returns:
        str or None: Extracted tee time or None if not found
    """
    if not note_content or pd.isna(note_content):
        return None

    # Pattern to match "Time: HH:MM AM/PM"
    patterns = [
        r'Time:\s*(\d{1,2}:\d{2}\s*[AaPp][Mm])',  # Time: 12:20 PM
        r'time:\s*(\d{1,2}:\d{2}\s*[AaPp][Mm])',  # time: 12:20 pm (case insensitive)
        r'Tee\s+Time:\s*(\d{1,2}:\d{2}\s*[AaPp][Mm])',  # Tee Time: 12:20 PM
        r'Tee\s+Time:\s*(\d{1,2}:\d{2})(?!\s*[AaPp][Mm])',  # Tee Time: 09:20 (24h, UK tee sheets)
        r'Time:\s*(\d{1,2}:\d{2})(?!\s*[AaPp][Mm])',  # Time: 09:20 (24h)
    ]

    for pattern in patterns:
        match = re.search(pattern, str(note_content), re.IGNORECASE)
        if match:
            tee_time = match.group(1).strip()
            # Normalize to uppercase (12:20 PM)
            return tee_time.upper()

    return None


def get_status_icon(status: str) -> str:
    """
    Get timeline icon for booking status

    Args:
        status (str): Booking status

    Returns:
        str: Icon for status (currently empty for text-only display)
    """
    status_icons = {
        'Inquiry': '',
        'Requested': '',
        'Confirmed': '',
        'Booked': '',
        'Rejected': '',
        'Cancelled': '',
        'Pending': '',
    }
    return status_icons.get(status, '')


def get_status_color(status: str) -> str:
    """
    Get color class for status badge

    Args:
        status (str): Booking status

    Returns:
        str: CSS class name for status
    """
    status_map = {
        'Inquiry': 'status-inquiry',
        'Requested': 'status-requested',
        'Confirmed': 'status-confirmed',
        'Booked': 'status-booked',
        'Rejected': 'status-rejected',
        'Cancelled': 'status-cancelled',
        'Pending': 'status-requested',
    }
    return status_map.get(status, 'status-inquiry')


def generate_status_progress_bar(current_status: str) -> str:
    """
    Generate a linear status progress bar showing booking workflow

    Args:
        current_status (str): Current booking status

    Returns:
        str: HTML string for progress bar
    """
    # Define the workflow stages with colors
    stages = [
        {'name': 'Inquiry', 'color': '#87a7b3'},
        {'name': 'Requested', 'color': '#cc8855'},
        {'name': 'Confirmed', 'color': '#8b9456'},
        {'name': 'Booked', 'color': '#6b7c3f'}
    ]

    # Handle special cases
    if current_status == 'Pending':
        current_status = 'Inquiry'

    # Check if rejected or cancelled
    is_rejected = current_status == 'Rejected'
    is_cancelled = current_status == 'Cancelled'

    if is_rejected or is_cancelled:
        status_color = '#a0653f' if is_rejected else '#666666'
        return f"""
        <div style='background: #3d5266; padding: 1rem; border-radius: 8px; border: 2px solid #6b7c3f;'>
            <div style='display: flex; align-items: center; justify-content: center; gap: 0.75rem;'>
                <div style='width: 12px; height: 12px; border-radius: 50%; background: {status_color};'></div>
                <span style='color: {status_color}; font-weight: 700; font-size: 1rem; text-transform: uppercase; letter-spacing: 0.5px;'>{current_status}</span>
            </div>
        </div>
        """

    # Find current stage index
    current_index = next((i for i, s in enumerate(stages) if s['name'] == current_status), 0)

    # Generate HTML
    html = """
    <div style='background: #3d5266; padding: 1.25rem; border-radius: 8px; border: 2px solid #6b7c3f;'>
        <div style='display: flex; align-items: center; justify-content: space-between; position: relative;'>
    """

    # Add connecting line
    html += """
        <div style='position: absolute; top: 1rem; left: 2rem; right: 2rem; height: 3px; background: #4a6278; z-index: 1;'></div>
    """

    # Add progress line (only up to current stage)
    progress_width = (current_index / (len(stages) - 1)) * 100 if len(stages) > 1 else 0
    html += f"""
        <div style='position: absolute; top: 1rem; left: 2rem; width: calc({progress_width}% - 2rem); height: 3px; background: linear-gradient(90deg, #87a7b3, #6b7c3f); z-index: 2;'></div>
    """

    # Add stage nodes
    for i, stage in enumerate(stages):
        is_active = i <= current_index
        is_current = i == current_index

        bg_color = stage['color'] if is_active else '#4a6278'
        text_color = '#f7f5f2' if is_active else '#999999'
        border_color = stage['color'] if is_current else ('#6b7c3f' if is_active else '#4a6278')

        html += f"""
        <div style='display: flex; flex-direction: column; align-items: center; z-index: 3; position: relative;'>
            <div style='
                width: 1.5rem;
                height: 1.5rem;
                border-radius: 50%;
                background: {bg_color};
                border: 3px solid {border_color};
                box-shadow: {('0 0 0 4px rgba(107, 124, 63, 0.2)' if is_current else 'none')};
                transition: all 0.3s ease;
            '>
            </div>
            <div style='
                margin-top: 0.5rem;
                font-size: 0.7rem;
                font-weight: {('700' if is_current else '600')};
                color: {text_color};
                text-transform: uppercase;
                letter-spacing: 0.5px;
                white-space: nowrap;
            '>{stage['name']}</div>
        </div>
        """

    html += """
        </div>
    </div>
    """

    return html
