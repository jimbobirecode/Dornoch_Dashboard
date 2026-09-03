# SendGrid Email Templates for Royal Dornoch

## Available Dynamic Fields

Both email templates now receive these fields:

```handlebars
{{guest_name}}       - Guest's name (e.g., "John Smith")
{{date}}             - Formatted date (e.g., "Monday, December 05, 2025")
{{course}}           - Golf course name (e.g., "Blue Course")
{{tee_time}}         - Tee time (e.g., "09:00 AM")
{{players}}          - Number of players (e.g., 4)
{{booking_ref}}      - Booking reference (e.g., "SSR-2025-001")
{{club_email}}       - Contact email
{{proshop_items}}    - Array of 3 featured products
```

---

## Template 1: Welcome Email (Pre-Arrival - 3 Days Before)

### Subject Line
```
Get Ready! Your Royal Dornoch Tee Time is in 3 Days
```

### HTML Template

```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {
            font-family: 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            background-color: #f4f4f4;
        }
        .container {
            background-color: #ffffff;
            padding: 0;
            border-radius: 8px;
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #2c5530 0%, #4a7c59 100%);
            color: white;
            padding: 40px 20px;
            text-align: center;
        }
        .header h1 {
            margin: 0;
            font-size: 28px;
            font-weight: 600;
        }
        .content {
            padding: 30px 20px;
        }
        .booking-details {
            background: #f8f9fa;
            border-left: 4px solid #4a7c59;
            padding: 20px;
            margin: 25px 0;
            border-radius: 4px;
        }
        .booking-details table {
            width: 100%;
            border-collapse: collapse;
        }
        .booking-details td {
            padding: 8px 0;
            font-size: 15px;
        }
        .booking-details td:first-child {
            font-weight: 600;
            color: #2c5530;
            width: 140px;
        }
        .checklist {
            background: #e8f5e9;
            padding: 20px;
            margin: 25px 0;
            border-radius: 4px;
        }
        .checklist h3 {
            margin-top: 0;
            color: #2c5530;
        }
        .checklist ul {
            margin: 10px 0;
            padding-left: 20px;
        }
        .checklist li {
            margin: 8px 0;
        }
        .proshop-section {
            margin: 30px 0;
        }
        .proshop-item {
            background: #fff;
            border: 1px solid #ddd;
            padding: 15px;
            margin: 15px 0;
            border-radius: 6px;
            display: flex;
            align-items: center;
        }
        .proshop-item-details {
            flex: 1;
        }
        .proshop-item h4 {
            margin: 0 0 5px 0;
            color: #2c5530;
        }
        .proshop-item p {
            margin: 5px 0;
            font-size: 14px;
            color: #666;
        }
        .price {
            font-size: 20px;
            font-weight: bold;
            color: #4a7c59;
        }
        .btn {
            display: inline-block;
            background: #4a7c59;
            color: white;
            padding: 10px 20px;
            text-decoration: none;
            border-radius: 4px;
            margin-top: 10px;
        }
        .footer {
            background: #f8f9fa;
            padding: 20px;
            text-align: center;
            color: #666;
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Welcome to Royal Dornoch Golf Club! 🏌️</h1>
            <p style="margin: 10px 0 0 0; font-size: 16px;">Your tee time is just 3 days away</p>
        </div>

        <div class="content">
            <p style="font-size: 16px;">Hi {{guest_name}},</p>

            <p>We're thrilled to welcome you to one of golf's most unique experiences! Here are your confirmed booking details:</p>

            <div class="booking-details">
                <table>
                    <tr>
                        <td>Date:</td>
                        <td><strong>{{date}}</strong></td>
                    </tr>
                    <tr>
                        <td>Course:</td>
                        <td><strong>{{course}}</strong></td>
                    </tr>
                    <tr>
                        <td>Tee Time:</td>
                        <td><strong>{{tee_time}}</strong></td>
                    </tr>
                    <tr>
                        <td>Players:</td>
                        <td><strong>{{players}}</strong></td>
                    </tr>
                    <tr>
                        <td>Booking Ref:</td>
                        <td><strong>{{booking_ref}}</strong></td>
                    </tr>
                </table>
            </div>

            <div class="checklist">
                <h3>✓ Pre-Arrival Checklist</h3>
                <ul>
                    <li><strong>Arrive 45 minutes early</strong> - Check in at the Pro Shop</li>
                    <li><strong>Dress Code</strong> - Collared shirts required, no denim on course</li>
                    <li><strong>Weather Check</strong> - Florida weather can change quickly</li>
                    <li><strong>GPS Carts</strong> - Included with your round</li>
                    <li><strong>Practice Facilities</strong> - Driving range available before your round</li>
                </ul>
            </div>

            <h3 style="color: #2c5530; margin-top: 30px;">Enhance Your Experience</h3>
            <p>Visit our Pro Shop before your round - we've picked some items you might love:</p>

            <div class="proshop-section">
                {{#each proshop_items}}
                <div class="proshop-item">
                    <div class="proshop-item-details">
                        <h4>{{this.name}}</h4>
                        <p>{{this.description}}</p>
                        <span class="price">${{this.price}}</span>
                        <br>
                        <a href="{{this.url}}" class="btn">Shop Now</a>
                    </div>
                </div>
                {{/each}}
            </div>

            <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 25px 0;">
                <strong>Need to make changes?</strong><br>
                Contact us at {{club_email}} or call +44 (0)1862 810219<br>
                Reference: {{booking_ref}}
            </div>

            <p style="font-size: 16px; margin-top: 30px;">We can't wait to see you on the course!</p>

            <p style="margin-top: 20px;">
                Best regards,<br>
                <strong>The Royal Dornoch Team</strong>
            </p>
        </div>

        <div class="footer">
            <p>Royal Dornoch Golf Club | Golf Road, Dornoch, Sutherland, IV25 3LW, Scotland</p>
            <p>{{club_email}} | +44 (0)1862 810219</p>
        </div>
    </div>
</body>
</html>
```

---

## Template 2: Thank You Email (Post-Play - 2 Days After)

### Subject Line
```
Thank You for Playing at Royal Dornoch! 🏆
```

### HTML Template

```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {
            font-family: 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            background-color: #f4f4f4;
        }
        .container {
            background-color: #ffffff;
            padding: 0;
            border-radius: 8px;
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #2c5530 0%, #4a7c59 100%);
            color: white;
            padding: 40px 20px;
            text-align: center;
        }
        .header h1 {
            margin: 0;
            font-size: 28px;
            font-weight: 600;
        }
        .content {
            padding: 30px 20px;
        }
        .visit-summary {
            background: #f8f9fa;
            border-left: 4px solid #4a7c59;
            padding: 20px;
            margin: 25px 0;
            border-radius: 4px;
        }
        .visit-summary table {
            width: 100%;
            border-collapse: collapse;
        }
        .visit-summary td {
            padding: 8px 0;
            font-size: 15px;
        }
        .visit-summary td:first-child {
            font-weight: 600;
            color: #2c5530;
            width: 140px;
        }
        .cta-box {
            background: linear-gradient(135deg, #4a7c59 0%, #2c5530 100%);
            color: white;
            padding: 25px;
            text-align: center;
            margin: 30px 0;
            border-radius: 8px;
        }
        .cta-box h3 {
            margin: 0 0 15px 0;
            font-size: 22px;
        }
        .btn-primary {
            display: inline-block;
            background: white;
            color: #2c5530;
            padding: 12px 30px;
            text-decoration: none;
            border-radius: 4px;
            font-weight: bold;
            margin: 10px 5px;
        }
        .btn-secondary {
            display: inline-block;
            background: transparent;
            color: white;
            border: 2px solid white;
            padding: 12px 30px;
            text-decoration: none;
            border-radius: 4px;
            font-weight: bold;
            margin: 10px 5px;
        }
        .proshop-item {
            background: #fff;
            border: 1px solid #ddd;
            padding: 15px;
            margin: 15px 0;
            border-radius: 6px;
        }
        .proshop-item h4 {
            margin: 0 0 5px 0;
            color: #2c5530;
        }
        .proshop-item p {
            margin: 5px 0;
            font-size: 14px;
            color: #666;
        }
        .price {
            font-size: 20px;
            font-weight: bold;
            color: #4a7c59;
        }
        .btn {
            display: inline-block;
            background: #4a7c59;
            color: white;
            padding: 10px 20px;
            text-decoration: none;
            border-radius: 4px;
            margin-top: 10px;
        }
        .footer {
            background: #f8f9fa;
            padding: 20px;
            text-align: center;
            color: #666;
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Thank You for Playing at Royal Dornoch! 🏆</h1>
            <p style="margin: 10px 0 0 0; font-size: 16px;">We hope you had an unforgettable round</p>
        </div>

        <div class="content">
            <p style="font-size: 16px;">Hi {{guest_name}},</p>

            <p>Thank you for choosing Royal Dornoch Golf Club! We hope your round on <strong>{{date}}</strong> was everything you hoped for and more.</p>

            <div class="visit-summary">
                <table>
                    <tr>
                        <td>Date Played:</td>
                        <td><strong>{{date}}</strong></td>
                    </tr>
                    <tr>
                        <td>Course:</td>
                        <td><strong>{{course}}</strong></td>
                    </tr>
                    <tr>
                        <td>Tee Time:</td>
                        <td><strong>{{tee_time}}</strong></td>
                    </tr>
                    <tr>
                        <td>Players:</td>
                        <td><strong>{{players}}</strong></td>
                    </tr>
                    <tr>
                        <td>Booking Ref:</td>
                        <td><strong>{{booking_ref}}</strong></td>
                    </tr>
                </table>
            </div>

            <div class="cta-box">
                <h3>Share Your Experience</h3>
                <p style="margin: 10px 0 20px 0;">Your feedback helps us continue to provide world-class golf experiences</p>
                <a href="https://g.page/r/YOUR_GOOGLE_REVIEW_LINK/review" class="btn-primary">Leave a Review</a>
                <a href="https://dornochgolf.com/tee-times" class="btn-secondary">Book Your Next Round</a>
            </div>

            <h3 style="color: #2c5530; margin-top: 30px;">Remember Your Visit - Shop Our Collection</h3>
            <p>Take home a piece of Royal Dornoch:</p>

            <div class="proshop-section">
                {{#each proshop_items}}
                <div class="proshop-item">
                    <h4>{{this.name}}</h4>
                    <p>{{this.description}}</p>
                    <span class="price">${{this.price}}</span>
                    <br>
                    <a href="{{this.url}}" class="btn">Shop Now</a>
                </div>
                {{/each}}
            </div>

            <div style="background: #e3f2fd; border-left: 4px solid #2196f3; padding: 15px; margin: 25px 0;">
                <strong>🎯 Special Offer for Return Guests</strong><br>
                Book your next round within 30 days and receive 10% off<br>
                Use code: <strong>COMEBACK10</strong>
            </div>

            <p style="font-size: 16px; margin-top: 30px;">We look forward to welcoming you back soon!</p>

            <p style="margin-top: 20px;">
                Best regards,<br>
                <strong>The Royal Dornoch Team</strong><br>
                {{club_email}}
            </p>
        </div>

        <div class="footer">
            <p>Royal Dornoch Golf Club | Golf Road, Dornoch, Sutherland, IV25 3LW, Scotland</p>
            <p>{{club_email}} | +44 (0)1862 810219</p>
            <p style="margin-top: 15px; font-size: 12px;">
                <a href="#" style="color: #666;">Unsubscribe</a> |
                <a href="#" style="color: #666;">Update Preferences</a>
            </p>
        </div>
    </div>
</body>
</html>
```

---

## Quick Setup in SendGrid

1. **Create Template 1 (Welcome Email)**
   - Go to Email API → Dynamic Templates → Create Template
   - Name: "Royal Dornoch Welcome Email"
   - Add Version → Code Editor
   - Paste the Welcome Email HTML above
   - Save and copy Template ID

2. **Create Template 2 (Thank You Email)**
   - Create another Dynamic Template
   - Name: "Royal Dornoch Thank You Email"
   - Add Version → Code Editor
   - Paste the Thank You Email HTML above
   - Save and copy Template ID

3. **Set Environment Variables**
   ```bash
   SENDGRID_TEMPLATE_PRE_ARRIVAL=d-xxxxxxxx  # Welcome email template ID
   SENDGRID_TEMPLATE_POST_PLAY=d-xxxxxxxx   # Thank you email template ID
   ```

---

## Testing Tips

- Use **SendGrid's Preview** feature to see how emails look
- Send test emails to yourself before going live
- Check both **desktop and mobile** views
- Update the Google Review link with your actual link
- Customize proshop items in `modules/customer_journey/emails.py`
