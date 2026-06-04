from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from models import WorkshopStatus, RoundStatus, GroupResultStatus


# ---------- Workshop ----------
class WorkshopCreate(BaseModel):
    title: str = Field(default="领导力共创研讨会", min_length=1, max_length=255)
    host_name: str = Field(..., min_length=1, max_length=100)


class WorkshopCreateResponse(BaseModel):
    id: int
    title: str
    host_name: str
    invite_code: str
    host_code: str
    kb_admin_code: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ValidateHostRequest(BaseModel):
    host_code: str


class ValidateInviteRequest(BaseModel):
    invite_code: str


class ValidateResponse(BaseModel):
    valid: bool
    workshop_id: Optional[int] = None
    workshop_title: Optional[str] = None


class WorkshopJoinRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    invite_code: str


# ---------- Participant ----------
class ParticipantOut(BaseModel):
    id: int
    workshop_id: int
    name: str
    group_id: int
    is_group_leader: bool

    model_config = {"from_attributes": True}


class ParticipantWithToken(ParticipantOut):
    session_token: str


# ---------- Round ----------
class RoundOut(BaseModel):
    id: int
    workshop_id: int
    round_number: int
    title: str
    objective: Optional[str] = None
    status: RoundStatus
    discussion_time: int
    input_time: int
    questions: List["QuestionOut"] = []

    model_config = {"from_attributes": True}


# ---------- Question ----------
class QuestionOut(BaseModel):
    id: int
    round_id: int
    content: str
    order: int

    model_config = {"from_attributes": True}


# ---------- Answer ----------
class AnswerSubmit(BaseModel):
    participant_id: int
    question_id: int
    content: str = Field(..., min_length=1)


class AnswerOut(BaseModel):
    id: int
    question_id: int
    participant_id: int
    content: str
    created_at: datetime
    participant_name: Optional[str] = None
    group_id: Optional[int] = None

    model_config = {"from_attributes": True}


# ---------- Group Round Result ----------
class GroupRoundResultOut(BaseModel):
    id: int
    round_id: int
    group_id: int
    status: GroupResultStatus
    original_content: Optional[str] = None
    edited_content: Optional[str] = None
    version: int
    validation_error: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class GroupResultEdit(BaseModel):
    edited_content: str


# ---------- Synthesis Result ----------
class SynthesisResultOut(BaseModel):
    id: int
    workshop_id: int
    round_id: int
    status: GroupResultStatus
    original_content: Optional[str] = None
    edited_content: Optional[str] = None
    version: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SynthesisResultEdit(BaseModel):
    edited_content: str


# ---------- Host Input ----------
class HostInputCreate(BaseModel):
    round_id: int
    content: str = Field(..., min_length=1)


class HostInputOut(BaseModel):
    id: int
    workshop_id: int
    round_id: int
    content: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ---------- Round Settings ----------
class RoundSettingsUpdate(BaseModel):
    discussion_time: Optional[int] = Field(default=None, ge=1, le=120)
    input_time: Optional[int] = Field(default=None, ge=1, le=60)


# ---------- Group Info (for host dashboard) ----------
class GroupInfo(BaseModel):
    group_id: int
    participant_count: int
    leader_name: Optional[str] = None
    members: List[ParticipantOut] = []


class RoundInfo(BaseModel):
    id: int
    round_number: int
    title: str
    objective: Optional[str] = None
    status: RoundStatus
    discussion_time: int
    input_time: int
    questions: List[QuestionOut] = []
    group_results: List[GroupRoundResultOut] = []
    synthesis: Optional[SynthesisResultOut] = None
    host_input: Optional[HostInputOut] = None


# ---------- Workshop Views ----------
class WorkshopMemberView(BaseModel):
    id: int
    title: str
    host_name: str
    invite_code: str
    current_round: int
    status: WorkshopStatus
    created_at: datetime
    participant: Optional[ParticipantWithToken] = None
    rounds: List[RoundOut] = []

    model_config = {"from_attributes": True}


class WorkshopHostView(BaseModel):
    id: int
    title: str
    host_name: str
    invite_code: str
    host_code: str
    kb_admin_code: str
    current_round: int
    status: WorkshopStatus
    created_at: datetime
    groups: List[GroupInfo] = []
    rounds: List[RoundInfo] = []
    knowledge_docs: List["KnowledgeDocumentOut"] = []

    model_config = {"from_attributes": True}


# ---------- Knowledge Base ----------
class ValidateAdminRequest(BaseModel):
    admin_code: str


class KnowledgeDocumentOut(BaseModel):
    id: int
    workshop_id: int
    original_filename: str
    file_size: int
    content_type: str
    chunk_count: int
    embedding_model: str
    upload_params: Optional[str] = None
    is_deleted: bool
    uploaded_at: datetime

    model_config = {"from_attributes": True}


# ---------- AI QA ----------
class AIQuestionSubmit(BaseModel):
    participant_id: int
    question: str = Field(..., min_length=1)


class AIQuestionOut(BaseModel):
    id: int
    question: str
    answer: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------- WebSocket ----------
class WSMessage(BaseModel):
    type: str
    data: dict


# ---------- Markdown Export ----------
class ExportResponse(BaseModel):
    markdown: str
    filename: str
