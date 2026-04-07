import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

// Konfigurasi SES Client
const sesClient = new SESClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

interface SendEmailParams {
  to: string;
  subject: string;
  htmlBody: string;
  textBody?: string;
}

/**
 * Mengirim email menggunakan Amazon SES
 */
export async function sendEmail({
  to,
  subject,
  htmlBody,
  textBody,
}: SendEmailParams): Promise<boolean> {
  const fromEmail = process.env.AWS_SES_FROM_EMAIL || 'noreply@example.com';

  try {
    const command = new SendEmailCommand({
      Source: fromEmail,
      Destination: {
        ToAddresses: [to],
      },
      Message: {
        Subject: {
          Data: subject,
          Charset: 'UTF-8',
        },
        Body: {
          Html: {
            Data: htmlBody,
            Charset: 'UTF-8',
          },
          ...(textBody && {
            Text: {
              Data: textBody,
              Charset: 'UTF-8',
            },
          }),
        },
      },
    });

    await sesClient.send(command);
    console.log(`Email berhasil dikirim ke ${to}`);
    return true;
  } catch (error) {
    console.error('Error mengirim email:', error);
    return false;
  }
}

/**
 * Template email untuk registrasi berhasil
 */
export function getRegistrationEmailTemplate(name: string, email: string): string {
  return `
<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Selamat Datang</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background-color: #f5f5f5;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 40px 20px;
            text-align: center;
        }
        .header h1 {
            color: #ffffff;
            margin: 0;
            font-size: 28px;
            font-weight: 600;
        }
        .content {
            padding: 40px 30px;
        }
        .welcome-text {
            font-size: 18px;
            color: #333333;
            margin-bottom: 20px;
            line-height: 1.6;
        }
        .info-box {
            background-color: #f8f9fa;
            border-left: 4px solid #667eea;
            padding: 20px;
            margin: 30px 0;
            border-radius: 4px;
        }
        .info-box p {
            margin: 0;
            color: #555555;
            line-height: 1.6;
        }
        .info-box strong {
            color: #333333;
        }
        .button {
            display: inline-block;
            padding: 14px 32px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: #ffffff;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 600;
            margin: 20px 0;
            transition: transform 0.2s;
        }
        .button:hover {
            transform: translateY(-2px);
        }
        .features {
            margin: 30px 0;
        }
        .feature-item {
            display: flex;
            align-items: start;
            margin: 15px 0;
        }
        .feature-icon {
            width: 24px;
            height: 24px;
            background-color: #667eea;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: bold;
            margin-right: 15px;
            flex-shrink: 0;
        }
        .feature-text {
            color: #555555;
            line-height: 1.6;
        }
        .footer {
            background-color: #f8f9fa;
            padding: 30px;
            text-align: center;
            border-top: 1px solid #e9ecef;
        }
        .footer p {
            color: #6c757d;
            font-size: 14px;
            margin: 5px 0;
        }
        .social-links {
            margin: 20px 0;
        }
        .social-links a {
            display: inline-block;
            margin: 0 10px;
            color: #667eea;
            text-decoration: none;
        }
        @media only screen and (max-width: 600px) {
            .content {
                padding: 30px 20px;
            }
            .header h1 {
                font-size: 24px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎉 Selamat Datang!</h1>
        </div>
        
        <div class="content">
            <p class="welcome-text">
                Halo <strong>${name}</strong>,
            </p>
            
            <p class="welcome-text">
                Terima kasih telah mendaftar! Akun Anda telah berhasil dibuat dan siap digunakan.
            </p>
            
            <div class="info-box">
                <p><strong>📧 Email:</strong> ${email}</p>
            </div>
            
            <div style="text-align: center;">
                <a href="${process.env.FRONTEND_URL || 'http://localhost:3005'}/login" class="button">
                    Masuk ke Akun Anda
                </a>
            </div>
            
            <div class="features">
                <p style="font-weight: 600; color: #333333; margin-bottom: 15px;">
                    Apa yang bisa Anda lakukan:
                </p>
                
                <div class="feature-item">
                    <div class="feature-icon">✓</div>
                    <div class="feature-text">
                        Kelola profil dan informasi akun Anda
                    </div>
                </div>
                
                <div class="feature-item">
                    <div class="feature-icon">✓</div>
                    <div class="feature-text">
                        Akses semua fitur dan layanan kami
                    </div>
                </div>
                
                <div class="feature-item">
                    <div class="feature-icon">✓</div>
                    <div class="feature-text">
                        Dapatkan notifikasi dan update terbaru
                    </div>
                </div>
            </div>
            
            <p style="color: #6c757d; font-size: 14px; margin-top: 30px; line-height: 1.6;">
                Jika Anda tidak merasa mendaftar akun ini, silakan abaikan email ini atau hubungi tim support kami.
            </p>
        </div>
        
        <div class="footer">
            <p style="font-weight: 600; color: #333333;">Butuh bantuan?</p>
            <p>Hubungi kami di <a href="mailto:support@example.com" style="color: #667eea;">support@example.com</a></p>
            
            <div class="social-links">
                <a href="#">Facebook</a> •
                <a href="#">Twitter</a> •
                <a href="#">Instagram</a>
            </div>
            
            <p style="margin-top: 20px;">
                © ${new Date().getFullYear()} Acme Inc. All rights reserved.
            </p>
        </div>
    </div>
</body>
</html>
  `.trim();
}

/**
 * Plain text version untuk email client yang tidak support HTML
 */
export function getRegistrationEmailTextTemplate(name: string, email: string): string {
  return `
Selamat Datang!

Halo ${name},

Terima kasih telah mendaftar! Akun Anda telah berhasil dibuat dan siap digunakan.

Email: ${email}

Silakan login ke akun Anda di: ${process.env.FRONTEND_URL || 'http://localhost:3005'}/login

Apa yang bisa Anda lakukan:
- Kelola profil dan informasi akun Anda
- Akses semua fitur dan layanan kami
- Dapatkan notifikasi dan update terbaru

Jika Anda tidak merasa mendaftar akun ini, silakan abaikan email ini atau hubungi tim support kami.

Butuh bantuan?
Hubungi kami di support@example.com

© ${new Date().getFullYear()} Acme Inc. All rights reserved.
  `.trim();
}

/**
 * Mengirim email registrasi
 */
export async function sendRegistrationEmail(name: string, email: string): Promise<boolean> {
  const htmlBody = getRegistrationEmailTemplate(name, email);
  const textBody = getRegistrationEmailTextTemplate(name, email);

  return await sendEmail({
    to: email,
    subject: '🎉 Selamat Datang! Registrasi Anda Berhasil',
    htmlBody,
    textBody,
  });
}
