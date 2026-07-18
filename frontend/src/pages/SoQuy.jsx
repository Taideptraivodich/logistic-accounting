import React, { useEffect, useState } from 'react';
import { Table, Card, Row, Col, Statistic, Drawer, Button, Space, DatePicker } from 'antd';
import { EyeOutlined, WalletOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import api from '../api/client';
import { formatMoney, moneyClass } from '../utils/format';

const { RangePicker } = DatePicker;
const DATE_FMT = 'YYYY-MM-DD';

export default function SoQuy() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  // Khung lọc ngày/tháng/năm giống sao kê ngân hàng — không chọn thì mặc định xem toàn bộ
  // (Đầu kỳ = số dư đầu kỳ gốc nhập tay trong Danh mục Quỹ, Tổng thu/chi = từ trước tới nay).
  const [range, setRange] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailData, setDetailData] = useState({ dau_ky: 0, rows: [], ton_cuoi: 0 });
  const [detailLoading, setDetailLoading] = useState(false);
  const navigate = useNavigate();

  const from = range?.[0] ? range[0].format(DATE_FMT) : undefined;
  const to = range?.[1] ? range[1].format(DATE_FMT) : undefined;

  const load = () => {
    setLoading(true);
    api
      .get('/reports/so-quy', { params: { from, to } })
      .then((res) => setRows(res.data))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  const openDetail = (r) => {
    setDetail(r);
    setDetailLoading(true);
    api
      .get(`/reports/so-quy/${r.id}/chi-tiet`, { params: { from, to } })
      .then((res) => setDetailData(res.data))
      .finally(() => setDetailLoading(false));
  };

  // Reload chi tiết đang mở nếu Senior đổi khung lọc ngày trong lúc Drawer đang mở.
  useEffect(() => {
    if (detail) openDetail(detail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to]);

  const columns = [
    { title: 'Hình thức thanh toán / Quỹ', dataIndex: 'name' },
    {
      title: 'Đầu kỳ',
      dataIndex: 'dau_ky',
      align: 'right',
      render: (v) => <span className={`money ${moneyClass(v)}`}>{formatMoney(v)}</span>,
    },
    {
      title: 'Tổng thu',
      dataIndex: 'thu',
      align: 'right',
      render: (v) => <span className="money money-pos">{formatMoney(v)}</span>,
    },
    {
      title: 'Tổng chi',
      dataIndex: 'chi',
      align: 'right',
      render: (v) => <span className="money money-neg">{formatMoney(v)}</span>,
    },
    {
      title: 'Cuối kỳ',
      dataIndex: 'ton_cuoi',
      align: 'right',
      render: (v) => <span className={`money ${moneyClass(v)}`}>{formatMoney(v)}</span>,
    },
    {
      title: '',
      width: 90,
      render: (_, r) => (
        <Button size="small" icon={<EyeOutlined />} onClick={() => openDetail(r)}>
          Chi tiết
        </Button>
      ),
    },
  ];

  const detailColumns = [
    { title: 'Ngày CT', dataIndex: 'ngay_ct', width: 100 },
    { title: 'Số CT', dataIndex: 'so_ct', width: 110 },
    { title: 'Đối tượng', dataIndex: 'doi_tuong', width: 150 },
    { title: 'Nội dung', dataIndex: 'ghi_chu' },
    {
      title: 'Thu',
      dataIndex: 'thu',
      align: 'right',
      render: (v) => (v ? <span className="money money-pos">{formatMoney(v)}</span> : '-'),
    },
    {
      title: 'Chi',
      dataIndex: 'chi',
      align: 'right',
      render: (v) => (v ? <span className="money money-neg">{formatMoney(v)}</span> : '-'),
    },
    {
      title: 'Tồn cuối',
      dataIndex: 'ton_cuoi',
      align: 'right',
      render: (v) => <span className={`money ${moneyClass(v)}`}>{formatMoney(v)}</span>,
    },
  ];

  // Dòng "Số dư đầu kỳ" ghim đầu bảng chi tiết, giống sổ chi tiết tài khoản ngân hàng trong MISA.
  const detailDataSource = [
    {
      id: '__dau_ky__',
      ngay_ct: '',
      so_ct: '',
      doi_tuong: '',
      ghi_chu: 'Số dư đầu kỳ',
      thu: 0,
      chi: 0,
      ton_cuoi: detailData.dau_ky,
      __isOpening: true,
    },
    ...detailData.rows,
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <RangePicker
          value={range}
          onChange={setRange}
          format="DD/MM/YYYY"
          placeholder={['Từ ngày', 'Đến ngày']}
          presets={[
            { label: 'Tháng này', value: [dayjs().startOf('month'), dayjs().endOf('month')] },
            { label: 'Tháng trước', value: [dayjs().subtract(1, 'month').startOf('month'), dayjs().subtract(1, 'month').endOf('month')] },
            { label: 'Năm nay', value: [dayjs().startOf('year'), dayjs().endOf('year')] },
          ]}
        />
      </Space>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        {rows.map((r) => (
          <Col span={8} key={r.id}>
            <Card size="small">
              <Statistic
                title={r.name}
                value={formatMoney(r.ton_cuoi)}
                prefix={<WalletOutlined />}
                valueStyle={{ color: r.ton_cuoi >= 0 ? '#2f9e44' : '#e03131' }}
              />
            </Card>
          </Col>
        ))}
      </Row>
      <Table rowKey="id" columns={columns} dataSource={rows} loading={loading} pagination={false} />

      <Drawer
        title={`Chi tiết sổ quỹ: ${detail?.name || ''}`}
        width={800}
        open={!!detail}
        onClose={() => setDetail(null)}
        extra={
          <Button
            size="small"
            icon={<UnorderedListOutlined />}
            onClick={() => navigate(`/vouchers?payment_method_id=${detail?.id}`)}
          >
            Quản lý phiếu thu / chi
          </Button>
        }
      >
        <Table
          rowKey="id"
          columns={detailColumns}
          dataSource={detailDataSource}
          loading={detailLoading}
          pagination={false}
          size="small"
          rowClassName={(r) => (r.__isOpening ? 'so-quy-opening-row' : '')}
        />
      </Drawer>
    </div>
  );
}
