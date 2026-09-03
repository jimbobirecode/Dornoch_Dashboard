"""Styling constants and CSS generation"""

from club_config import COLORS as BRAND_COLORS

# Active club palette (keys keep their historical Streamsong names so the
# CSS below works unchanged; values come from club_config.py)
STREAMSONG_COLORS = BRAND_COLORS


def get_dashboard_css():
    """
    Generate CSS for Streamsong dashboard

    Returns:
        str: CSS stylesheet as string
    """
    return f"""
    <style>
    .main {{
        background: {STREAMSONG_COLORS['background_dark']};
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
    }}

    [data-testid="stSidebar"] {{
        background: {STREAMSONG_COLORS['slate_blue']};
        border-right: 2px solid {STREAMSONG_COLORS['olive_green']};
    }}

    .metric-card {{
        background: linear-gradient(135deg, {STREAMSONG_COLORS['slate_blue']} 0%, {STREAMSONG_COLORS['card_gradient_end']} 100%);
        padding: 1.75rem;
        border-radius: 12px;
        border: 2px solid {STREAMSONG_COLORS['olive_green']};
        transition: all 0.3s ease;
        position: relative;
        overflow: hidden;
    }}

    .metric-card::before {{
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 3px;
        background: linear-gradient(90deg, {STREAMSONG_COLORS['olive_green']}, {STREAMSONG_COLORS['rust_copper']});
        opacity: 0;
        transition: opacity 0.3s ease;
    }}

    .metric-card:hover {{
        border-color: {STREAMSONG_COLORS['rust_copper']};
        box-shadow: 0 8px 24px rgba(107, 124, 63, 0.5);
        transform: translateY(-2px);
    }}

    .metric-card:hover::before {{
        opacity: 1;
    }}

    .booking-id {{
        font-size: 1rem;
        font-weight: 600;
        color: {STREAMSONG_COLORS['off_white']};
        margin: 0;
        font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
        letter-spacing: 0.5px;
    }}

    .booking-email {{
        color: {STREAMSONG_COLORS['sand_dune']};
        font-size: 0.875rem;
        margin: 0.375rem 0 0 0;
    }}

    .timestamp {{
        color: {STREAMSONG_COLORS['sand_dune']};
        font-size: 0.8125rem;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        font-weight: 500;
    }}

    .timestamp-value {{
        color: {STREAMSONG_COLORS['off_white']};
        font-size: 0.875rem;
        font-weight: 600;
        margin-top: 0.25rem;
    }}

    .stTextArea textarea {{
        background: {STREAMSONG_COLORS['slate_blue']} !important;
        border: 2px solid {STREAMSONG_COLORS['olive_green']} !important;
        border-radius: 0 0 8px 8px !important;
        color: {STREAMSONG_COLORS['off_white']} !important;
        font-family: 'SF Mono', 'Monaco', 'Consolas', monospace !important;
        font-size: 0.8125rem !important;
        line-height: 1.7 !important;
        padding: 1rem !important;
    }}

    .stTextArea textarea:disabled {{
        background: {STREAMSONG_COLORS['card_gradient_end']} !important;
        color: {STREAMSONG_COLORS['sand_dune']} !important;
        opacity: 1 !important;
        -webkit-text-fill-color: {STREAMSONG_COLORS['sand_dune']} !important;
    }}

    .status-badge {{
        padding: 0.375rem 0.875rem;
        border-radius: 6px;
        font-weight: 600;
        font-size: 0.8125rem;
        display: inline-flex;
        align-items: center;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }}

    .status-inquiry {{
        background: {STREAMSONG_COLORS['florida_sky']};
        color: #ffffff;
        border: 2px solid {STREAMSONG_COLORS['florida_sky']};
    }}

    .status-requested {{
        background: {STREAMSONG_COLORS['sunset_orange']};
        color: #ffffff;
        border: 2px solid {STREAMSONG_COLORS['sunset_orange']};
    }}

    .status-confirmed {{
        background: {STREAMSONG_COLORS['native_grass']};
        color: #ffffff;
        border: 2px solid {STREAMSONG_COLORS['native_grass']};
    }}

    .status-booked {{
        background: {STREAMSONG_COLORS['olive_green']};
        color: #ffffff;
        border: 2px solid {STREAMSONG_COLORS['olive_green']};
    }}

    .status-rejected {{
        background: {STREAMSONG_COLORS['rust_copper']};
        color: #ffffff;
        border: 2px solid {STREAMSONG_COLORS['rust_copper']};
    }}

    .status-cancelled {{
        background: {STREAMSONG_COLORS['warm_grey']};
        color: #ffffff;
        border: 2px solid {STREAMSONG_COLORS['warm_grey']};
    }}

    .stButton > button {{
        background: {STREAMSONG_COLORS['olive_green']};
        color: white;
        border: none;
        padding: 0.625rem 1.25rem;
        border-radius: 6px;
        font-weight: 600;
        font-size: 0.875rem;
        transition: all 0.2s ease;
        width: 100%;
        letter-spacing: 0.3px;
        cursor: pointer;
    }}

    .stButton > button:hover {{
        background: {STREAMSONG_COLORS['native_grass']};
        box-shadow: 0 4px 12px rgba(107, 124, 63, 0.3);
        transform: translateY(-1px);
    }}

    .stButton > button:active {{
        transform: translateY(0px);
    }}

    h1 {{
        color: {STREAMSONG_COLORS['off_white']} !important;
        font-weight: 700 !important;
        font-size: 1.875rem !important;
        letter-spacing: -0.5px !important;
    }}

    h2, h3, h4, h5, h6 {{
        color: {STREAMSONG_COLORS['off_white']} !important;
        font-weight: 600 !important;
    }}

    p, span, div, label {{
        color: {STREAMSONG_COLORS['sand_dune']} !important;
    }}

    .user-badge {{
        background: {STREAMSONG_COLORS['olive_green']};
        color: white;
        padding: 0.5rem 1rem;
        border-radius: 6px;
        font-size: 0.8125rem;
        font-weight: 600;
        display: inline-block;
        margin-bottom: 0.5rem;
        letter-spacing: 0.3px;
    }}

    .club-badge {{
        background: {STREAMSONG_COLORS['rust_copper']};
        color: white;
        padding: 0.5rem 1rem;
        border-radius: 6px;
        font-size: 0.8125rem;
        font-weight: 600;
        display: inline-block;
        margin-bottom: 1rem;
        letter-spacing: 0.3px;
    }}

    .data-label {{
        color: {STREAMSONG_COLORS['sand_dune']};
        font-size: 0.75rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 0.5rem;
    }}

    .streamlit-expanderHeader {{
        background: {STREAMSONG_COLORS['slate_blue']} !important;
        border-radius: 8px !important;
        border: 2px solid {STREAMSONG_COLORS['olive_green']} !important;
        font-weight: 600 !important;
        font-size: 0.875rem !important;
        color: {STREAMSONG_COLORS['off_white']} !important;
        transition: all 0.2s ease !important;
    }}

    .streamlit-expanderHeader:hover {{
        border-color: {STREAMSONG_COLORS['rust_copper']} !important;
        background: {STREAMSONG_COLORS['card_gradient_end']} !important;
    }}

    .streamlit-expanderContent {{
        background: {STREAMSONG_COLORS['slate_blue']} !important;
        border: 2px solid {STREAMSONG_COLORS['olive_green']} !important;
        border-top: none !important;
        border-radius: 0 0 8px 8px !important;
    }}

    @keyframes slideUp {{
        from {{
            opacity: 0;
            transform: translateY(20px);
        }}
        to {{
            opacity: 1;
            transform: translateY(0);
        }}
    }}

    .booking-card {{
        animation: slideUp 0.3s ease-out;
    }}

    .stMultiSelect > div > div {{
        background: {STREAMSONG_COLORS['slate_blue']} !important;
        border: 2px solid {STREAMSONG_COLORS['olive_green']} !important;
        border-radius: 6px !important;
        color: {STREAMSONG_COLORS['off_white']} !important;
    }}

    .stDateInput > div > div {{
        background: {STREAMSONG_COLORS['slate_blue']} !important;
        border: 2px solid {STREAMSONG_COLORS['olive_green']} !important;
        border-radius: 6px !important;
        color: {STREAMSONG_COLORS['off_white']} !important;
    }}

    #MainMenu {{visibility: hidden;}}
    footer {{visibility: hidden;}}
    header {{visibility: hidden;}}
    </style>
    """
