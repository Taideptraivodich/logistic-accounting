import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Table, Button, Input, Select, Space, Tag, Popconfirm, message, Typography } from 'antd';
import { PlusOutlined, PrinterOutlined, EditOutlined, DeleteOutlined, CheckOutlined, UndoOutlined } from '@ant-design/icons';
import api from '../api/client';
import { formatMoney } from '../utils/format';

const LOAI_LABEL = { dich_vu: 'Dịch vụ', chi_ho: 'Chi hộ' };
const LOAI_COLOR = { dich_vu: 'blue', chi_ho: 'orange' };

export default function DebitNotes() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState(undefined);

  const load = () => {
    setLoading(true);
    api
      .get('/debit-notes', { params: { q: q || undefined, status } })
      .then(({ data }) => setRows(data))
      .catch(() => message.error('Không tải được danh sách Debit Note'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [status]);

  const onConfirm = async (id) => {
    try {
      await api.post(`/debit-notes/${id}/confirm`);
      message.success('Đã xác nhận Debit Note');
      load();
    } catch (e) {
      message.error(e?.response?.data?.error || 'Không xác nhận được');
    }
  };
  const onUnconfirm = async (id) => {
    try {
      await api.post(`/debit-notes/${id}/unconfirm`);
      message.success('Đã huỷ xác nhận');
      load();
    } catch (e) {
      message.error(e?.response?.data?.error || 'Không huỷ được');
    }
  };
  const onDelete = async (id) => {
    try {
      await api.delete(`/debit-notes/${id}`);
      message.success('Đã xoá');
      load();
    } catch (e) {
      message.error(e?.response?.data?.error || 'Không xoá được');
    }
  };

  const columns = [
    { title: 'Số DN', dataIndex: 'so_dn', width: 120 },
    {
      title: 'Loại',
      dataIndex: 'loai',
      width: 100,
      render: (v) => <Tag color={LOAI_COLOR[v]}>{LOAI_LABEL[v] || v}</Tag>,
    },
    { title: 'Khách hàng', dataIndex: 'customer_name' },
    { title: 'Mã lô', dataIndex: 'ma_lo', width: 110 },
    { title: 'Ngày', dataIndex: 'ngay_ct', width: 110 },
    {
      title: 'Tổng cộng',
      dataIndex: 'tong_cong',
      align: 'right',
      width: 140,
      render: (v) => <b className="money">{formatMoney(v)}</b>,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      width: 110,
      render: (v) => (v === 'confirmed' ? <Tag color="green">Đã xác nhận</Tag> : <Tag>Nháp</Tag>),
    },
    {
      title: '',
      width: 220,
      render: (_, r) => (
        <Space size="small">
          <Button size="small" icon={<PrinterOutlined />} onClick={() => navigate(`/debit-notes/${r.id}/print`)}>
            Xem / In
          </Button>
          {r.status === 'draft' ? (
            <>
              <Button size="small" icon={<EditOutlined />} onClick={() => navigate(`/debit-notes/${r.id}/edit`)} />
              <Button size="small" icon={<CheckOutlined />} onClick={() => onConfirm(r.id)} />
              <Popconfirm title="Xoá Debit Note này?" onConfirm={() => onDelete(r.id)}>
                <Button size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            </>
          ) : (
            <Button size="small" icon={<UndoOutlined />} onClick={() => onUnconfirm(r.id)}>
              Huỷ xác nhận
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }} wrap>
        <Space>
          <Input.Search
            placeholder="Tìm số DN / khách hàng / mã lô / số tờ khai"
            allowClear
            style={{ width: 320 }}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onSearch={load}
          />
          <Select
            placeholder="Trạng thái"
            allowClear
            style={{ width: 160 }}
            value={status}
            onChange={setStatus}
            options={[
              { value: 'draft', label: 'Nháp' },
              { value: 'confirmed', label: 'Đã xác nhận' },
            ]}
          />
        </Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/debit-notes/new')}>
          Tạo Debit Note
        </Button>
      </Space>

      <Table rowKey="id" columns={columns} dataSource={rows} loading={loading} size="small" />

      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        Debit Note ở trạng thái "Nháp" có thể sửa/xoá tự do. Sau khi "Xác nhận", dữ liệu được khoá
        (snapshot) — muốn sửa phải "Huỷ xác nhận" trước.
      </Typography.Text>
    </div>
  );
}
