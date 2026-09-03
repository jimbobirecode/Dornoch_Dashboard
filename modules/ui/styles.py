"""Styling constants and CSS generation"""

# Royal Dornoch Brand Color Palette
DORNOCH_COLORS = {
    # Royal Dornoch palette
    'sea_slate': '#2B4048',
    'firth_blue': '#4C7A93',
    'fescue_green': '#6B7F4E',
    'gorse_yellow': '#E8B31C',
    'heather': '#7A5C86',
    'marram_gold': '#C6A96A',
    'dune_sand': '#E0D5BE',
    'granite_grey': '#8E8C85',
    'off_white': '#F6F3EC',
    'background_dark': '#1F2F36',
    'card_gradient_start': '#2B4048',
    'card_gradient_end': '#4C7A93',
}

# Backwards-compatible aliases for the previous colour key names
DORNOCH_COLORS.update({
    'slate_blue': DORNOCH_COLORS['sea_slate'],
    'florida_sky': DORNOCH_COLORS['firth_blue'],
    'rust_copper': DORNOCH_COLORS['fescue_green'],
    'olive_green': DORNOCH_COLORS['fescue_green'],
    'native_grass': DORNOCH_COLORS['marram_gold'],
    'sunset_orange': DORNOCH_COLORS['gorse_yellow'],
    'sand_dune': DORNOCH_COLORS['dune_sand'],
    'warm_grey': DORNOCH_COLORS['granite_grey'],
})


def get_dashboard_css():
    """
    Generate CSS for Royal Dornoch dashboard

    Returns:
        str: CSS stylesheet as string
    """
    return f"""
    <style>
    .main {{
        background: {DORNOCH_COLORS['background_dark']};
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
    }}

    [data-testid="stSidebar"] {{
        background: {DORNOCH_COLORS['slate_blue']};
        border-right: 2px solid {DORNOCH_COLORS['olive_green']};
    }}

    .metric-card {{
        background: linear-gradient(135deg, {DORNOCH_COLORS['slate_blue']} 0%, {DORNOCH_COLORS['card_gradient_end']} 100%);
        padding: 1.75rem;
        border-radius: 12px;
        border: 2px solid {DORNOCH_COLORS['olive_green']};
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
        background: linear-gradient(90deg, {DORNOCH_COLORS['olive_green']}, {DORNOCH_COLORS['rust_copper']});
        opacity: 0;
        transition: opacity 0.3s ease;
    }}

    .metric-card:hover {{
        border-color: {DORNOCH_COLORS['rust_copper']};
        box-shadow: 0 8px 24px rgba(107, 124, 63, 0.5);
        transform: translateY(-2px);
    }}

    .metric-card:hover::before {{
        opacity: 1;
    }}

    .booking-id {{
        font-size: 1rem;
        font-weight: 600;
        color: {DORNOCH_COLORS['off_white']};
        margin: 0;
        font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
        letter-spacing: 0.5px;
    }}

    .booking-email {{
        color: {DORNOCH_COLORS['sand_dune']};
        font-size: 0.875rem;
        margin: 0.375rem 0 0 0;
    }}

    .timestamp {{
        color: {DORNOCH_COLORS['sand_dune']};
        font-size: 0.8125rem;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        font-weight: 500;
    }}

    .timestamp-value {{
        color: {DORNOCH_COLORS['off_white']};
        font-size: 0.875rem;
        font-weight: 600;
        margin-top: 0.25rem;
    }}

    .stTextArea textarea {{
        background: {DORNOCH_COLORS['slate_blue']} !important;
        border: 2px solid {DORNOCH_COLORS['olive_green']} !important;
        border-radius: 0 0 8px 8px !important;
        color: {DORNOCH_COLORS['off_white']} !important;
        font-family: 'SF Mono', 'Monaco', 'Consolas', monospace !important;
        font-size: 0.8125rem !important;
        line-height: 1.7 !important;
        padding: 1rem !important;
    }}

    .stTextArea textarea:disabled {{
        background: {DORNOCH_COLORS['card_gradient_end']} !important;
        color: {DORNOCH_COLORS['sand_dune']} !important;
        opacity: 1 !important;
        -webkit-text-fill-color: {DORNOCH_COLORS['sand_dune']} !important;
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
        background: {DORNOCH_COLORS['florida_sky']};
        color: #ffffff;
        border: 2px solid {DORNOCH_COLORS['florida_sky']};
    }}

    .status-requested {{
        background: {DORNOCH_COLORS['sunset_orange']};
        color: #ffffff;
        border: 2px solid {DORNOCH_COLORS['sunset_orange']};
    }}

    .status-confirmed {{
        background: {DORNOCH_COLORS['native_grass']};
        color: #ffffff;
        border: 2px solid {DORNOCH_COLORS['native_grass']};
    }}

    .status-booked {{
        background: {DORNOCH_COLORS['olive_green']};
        color: #ffffff;
        border: 2px solid {DORNOCH_COLORS['olive_green']};
    }}

    .status-rejected {{
        background: {DORNOCH_COLORS['rust_copper']};
        color: #ffffff;
        border: 2px solid {DORNOCH_COLORS['rust_copper']};
    }}

    .status-cancelled {{
        background: {DORNOCH_COLORS['warm_grey']};
        color: #ffffff;
        border: 2px solid {DORNOCH_COLORS['warm_grey']};
    }}

    .stButton > button {{
        background: {DORNOCH_COLORS['olive_green']};
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
        background: {DORNOCH_COLORS['native_grass']};
        box-shadow: 0 4px 12px rgba(107, 124, 63, 0.3);
        transform: translateY(-1px);
    }}

    .stButton > button:active {{
        transform: translateY(0px);
    }}

    h1 {{
        color: {DORNOCH_COLORS['off_white']} !important;
        font-weight: 700 !important;
        font-size: 1.875rem !important;
        letter-spacing: -0.5px !important;
    }}

    h2, h3, h4, h5, h6 {{
        color: {DORNOCH_COLORS['off_white']} !important;
        font-weight: 600 !important;
    }}

    p, span, div, label {{
        color: {DORNOCH_COLORS['sand_dune']} !important;
    }}

    .user-badge {{
        background: {DORNOCH_COLORS['olive_green']};
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
        background: {DORNOCH_COLORS['rust_copper']};
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
        color: {DORNOCH_COLORS['sand_dune']};
        font-size: 0.75rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 0.5rem;
    }}

    .streamlit-expanderHeader {{
        background: {DORNOCH_COLORS['slate_blue']} !important;
        border-radius: 8px !important;
        border: 2px solid {DORNOCH_COLORS['olive_green']} !important;
        font-weight: 600 !important;
        font-size: 0.875rem !important;
        color: {DORNOCH_COLORS['off_white']} !important;
        transition: all 0.2s ease !important;
    }}

    .streamlit-expanderHeader:hover {{
        border-color: {DORNOCH_COLORS['rust_copper']} !important;
        background: {DORNOCH_COLORS['card_gradient_end']} !important;
    }}

    .streamlit-expanderContent {{
        background: {DORNOCH_COLORS['slate_blue']} !important;
        border: 2px solid {DORNOCH_COLORS['olive_green']} !important;
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
        background: {DORNOCH_COLORS['slate_blue']} !important;
        border: 2px solid {DORNOCH_COLORS['olive_green']} !important;
        border-radius: 6px !important;
        color: {DORNOCH_COLORS['off_white']} !important;
    }}

    .stDateInput > div > div {{
        background: {DORNOCH_COLORS['slate_blue']} !important;
        border: 2px solid {DORNOCH_COLORS['olive_green']} !important;
        border-radius: 6px !important;
        color: {DORNOCH_COLORS['off_white']} !important;
    }}

    #MainMenu {{visibility: hidden;}}
    footer {{visibility: hidden;}}
    header {{visibility: hidden;}}
    </style>
    """
