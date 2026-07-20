import React, { useState } from 'react';
import { Card, Typography, Alert, Avatar, Upload, Button, Space } from 'antd';
import { UserOutlined, UploadOutlined, DeleteOutlined } from '@ant-design/icons';
import api from '../api/client.js';
import { useAuth } from '../auth/AuthContext.jsx';

const MAX_SOURCE_SIZE_MB = 8; // giới hạn file gốc chọn từ máy, trước khi nén lại
const OUTPUT_SIZE = 400; // ảnh sau khi nén sẽ là hình vuông OUTPUT_SIZE x OUTPUT_SIZE

// Resize + nén ảnh về hình vuông (crop giữa) bằng canvas, trả về data URL JPEG — giúp ảnh chụp
// từ điện thoại (vài MB) thu nhỏ về vài chục-vài trăm KB trước khi gửi lên server.
function resizeImageToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Không đọc được file ảnh'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('File không phải ảnh hợp lệ'));
      img.onload = () => {
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;
        const canvas = document.createElement('canvas');
        canvas.width = OUTPUT_SIZE;
        canvas.height = OUTPUT_SIZE;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, sx, sy, side, side, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export default function ChangeAvatar() {
  const { user, updateUser } = useAuth();
  const [preview, setPreview] = useState(user?.avatarUrl || null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  const handleBeforeUpload = async (file) => {
    setError('');
    setSuccess('');
    if (!file.type?.startsWith('image/')) {
      setError('Vui lòng chọn file ảnh (PNG, JPEG, WEBP...)');
      return Upload.LIST_IGNORE;
    }
    if (file.size > MAX_SOURCE_SIZE_MB * 1024 * 1024) {
      setError(`Ảnh quá lớn, vui lòng chọn ảnh nhỏ hơn ${MAX_SOURCE_SIZE_MB}MB`);
      return Upload.LIST_IGNORE;
    }
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      setPreview(dataUrl);
    } catch {
      setError('Không xử lý được ảnh này, vui lòng thử ảnh khác');
    }
    // Chặn antd tự upload file lên server theo cách mặc định — mình tự gửi qua nút "Lưu ảnh".
    return false;
  };

  const handleSave = async () => {
    if (!preview || preview === user?.avatarUrl) return;
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      const { data } = await api.post('/auth/avatar', { avatarUrl: preview });
      updateUser({ avatarUrl: data.avatarUrl });
      setSuccess('Đổi ảnh đại diện thành công.');
    } catch (err) {
      setError(err?.response?.data?.error || 'Không thể lưu ảnh đại diện, vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    setError('');
    setSuccess('');
    setRemoving(true);
    try {
      await api.delete('/auth/avatar');
      updateUser({ avatarUrl: null });
      setPreview(null);
      setSuccess('Đã gỡ ảnh đại diện.');
    } catch (err) {
      setError(err?.response?.data?.error || 'Không thể gỡ ảnh đại diện, vui lòng thử lại.');
    } finally {
      setRemoving(false);
    }
  };

  return (
    <Card style={{ maxWidth: 420 }}>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        Đổi ảnh đại diện
      </Typography.Title>

      {error && <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} />}
      {success && <Alert type="success" message={success} showIcon style={{ marginBottom: 16 }} />}

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <Avatar size={120} src={preview || undefined} icon={!preview && <UserOutlined />} />

        <Space wrap style={{ justifyContent: 'center' }}>
          <Upload accept="image/*" showUploadList={false} beforeUpload={handleBeforeUpload}>
            <Button icon={<UploadOutlined />}>Chọn ảnh khác</Button>
          </Upload>
          {preview && (
            <Button danger icon={<DeleteOutlined />} loading={removing} onClick={handleRemove}>
              Gỡ ảnh
            </Button>
          )}
        </Space>

        <Button
          type="primary"
          block
          loading={saving}
          disabled={!preview || preview === user?.avatarUrl}
          onClick={handleSave}
        >
          Lưu ảnh đại diện
        </Button>

        <Typography.Text type="secondary" style={{ fontSize: 12, textAlign: 'center' }}>
          Ảnh sẽ được cắt vuông và nén nhỏ tự động trước khi lưu.
        </Typography.Text>
      </div>
    </Card>
  );
}
