import React, { useState } from 'react'
import { Button, Card, Field, Modal, ListRow, EmptyState } from '../index'

// 프리미티브 갤러리 — 개발 중 눈으로 확인용. 데스크톱에서 location.hash 가 #ui-preview 일 때 렌더.
export const Preview: React.FC = () => {
  const [open, setOpen] = useState(false)
  const [val, setVal] = useState('')
  return (
    <div style={{ padding: 24, display: 'grid', gap: 16, maxWidth: 640, margin: '0 auto', width: '100%' }}>
      <h1 style={{ margin: 0, fontSize: 22 }}>UI 프리미티브 프리뷰</h1>

      <Card title="Buttons">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="success">Success</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="line">Line</Button>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <Button size="sm">Small</Button>
          <Button loading>Loading</Button>
          <Button disabled>Disabled</Button>
        </div>
      </Card>

      <Card title="Field">
        <Field label="지갑 주소" placeholder="0x..." value={val} onChange={(e) => setVal(e.target.value)} hint="예: 0x83f0..." />
        <div style={{ height: 10 }} />
        <Field label="비밀번호" type="password" error="비밀번호가 올바르지 않습니다" />
      </Card>

      <Card title="ListRow">
        <div style={{ display: 'grid', gap: 8 }}>
          <ListRow title="지역청년패스" sub="대전 · YouthPassSBT" right={<Button size="sm" variant="line">보기</Button>} />
          <ListRow title="졸업증명서" sub="충남대학교 · UniversityAcademicCredential" />
        </div>
      </Card>

      <Card title="Modal / Empty">
        <Button onClick={() => setOpen(true)}>모달 열기</Button>
        <div style={{ marginTop: 10 }}><EmptyState>표시할 항목이 없습니다.</EmptyState></div>
      </Card>

      <Modal
        open={open}
        title="발급 승인"
        onClose={() => setOpen(false)}
        footer={<>
          <Button variant="ghost" onClick={() => setOpen(false)}>취소</Button>
          <Button variant="primary" onClick={() => setOpen(false)}>승인</Button>
        </>}
      >
        이 증명서(VC)를 지갑에 발급하시겠습니까?
      </Modal>
    </div>
  )
}
