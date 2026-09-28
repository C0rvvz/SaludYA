--
-- PostgreSQL database dump
--

\restrict qLVkBoJhRejtylQzADtTFzemgIzLrxOdNzaCGe5eisEn6vRUQ6hR1dkLondjeII

-- Dumped from database version 16.15
-- Dumped by pg_dump version 16.15

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

ALTER TABLE ONLY public.pacientes DROP CONSTRAINT pacientes_eps_id_fkey;
ALTER TABLE ONLY public.especialistas DROP CONSTRAINT especialistas_especialidad_id_fkey;
ALTER TABLE ONLY public.especialista_sedes DROP CONSTRAINT especialista_sedes_sede_id_fkey;
ALTER TABLE ONLY public.especialista_sedes DROP CONSTRAINT especialista_sedes_especialista_id_fkey;
ALTER TABLE ONLY public.especialista_modalidades DROP CONSTRAINT especialista_modalidades_especialista_id_fkey;
ALTER TABLE ONLY public.disponibilidad DROP CONSTRAINT disponibilidad_sede_id_fkey;
ALTER TABLE ONLY public.disponibilidad DROP CONSTRAINT disponibilidad_especialista_id_fkey;
ALTER TABLE ONLY public.codigos_otp DROP CONSTRAINT codigos_otp_paciente_id_fkey;
ALTER TABLE ONLY public.citas DROP CONSTRAINT citas_paciente_id_fkey;
ALTER TABLE ONLY public.citas DROP CONSTRAINT citas_disponibilidad_id_fkey;
DROP INDEX public.ix_pacientes_numero_documento;
DROP INDEX public.ix_disponibilidad_sede_id;
DROP INDEX public.ix_disponibilidad_fecha;
DROP INDEX public.ix_disponibilidad_estado;
DROP INDEX public.ix_disponibilidad_especialista_id;
DROP INDEX public.ix_codigos_otp_paciente_id;
DROP INDEX public.ix_citas_paciente_id;
ALTER TABLE ONLY public.disponibilidad DROP CONSTRAINT uq_disponibilidad_franja;
ALTER TABLE ONLY public.sedes DROP CONSTRAINT sedes_pkey;
ALTER TABLE ONLY public.pacientes DROP CONSTRAINT pacientes_pkey;
ALTER TABLE ONLY public.especialistas DROP CONSTRAINT especialistas_pkey;
ALTER TABLE ONLY public.especialista_sedes DROP CONSTRAINT especialista_sedes_pkey;
ALTER TABLE ONLY public.especialista_modalidades DROP CONSTRAINT especialista_modalidades_pkey;
ALTER TABLE ONLY public.especialidades DROP CONSTRAINT especialidades_pkey;
ALTER TABLE ONLY public.especialidades DROP CONSTRAINT especialidades_nombre_key;
ALTER TABLE ONLY public.eps DROP CONSTRAINT eps_pkey;
ALTER TABLE ONLY public.eps DROP CONSTRAINT eps_nombre_key;
ALTER TABLE ONLY public.disponibilidad DROP CONSTRAINT disponibilidad_pkey;
ALTER TABLE ONLY public.codigos_otp DROP CONSTRAINT codigos_otp_pkey;
ALTER TABLE ONLY public.citas DROP CONSTRAINT citas_pkey;
ALTER TABLE ONLY public.citas DROP CONSTRAINT citas_numero_comprobante_key;
ALTER TABLE ONLY public.citas DROP CONSTRAINT citas_disponibilidad_id_key;
ALTER TABLE ONLY public.alembic_version DROP CONSTRAINT alembic_version_pkc;
DROP TABLE public.sedes;
DROP TABLE public.pacientes;
DROP TABLE public.especialistas;
DROP TABLE public.especialista_sedes;
DROP TABLE public.especialista_modalidades;
DROP TABLE public.especialidades;
DROP TABLE public.eps;
DROP TABLE public.disponibilidad;
DROP TABLE public.codigos_otp;
DROP TABLE public.citas;
DROP TABLE public.alembic_version;
DROP TYPE public.tipo_documento;
DROP TYPE public.modalidad;
DROP TYPE public.estado_otp;
DROP TYPE public.estado_disponibilidad;
DROP TYPE public.estado_cita;
DROP TYPE public.estado_afiliacion;
DROP TYPE public.canal_otp;
DROP TYPE public.canal_contacto;
--
-- Name: canal_contacto; Type: TYPE; Schema: public; Owner: saludya_user
--

CREATE TYPE public.canal_contacto AS ENUM (
    'whatsapp',
    'sms',
    'correo',
    'llamada'
);


ALTER TYPE public.canal_contacto OWNER TO saludya_user;

--
-- Name: canal_otp; Type: TYPE; Schema: public; Owner: saludya_user
--

CREATE TYPE public.canal_otp AS ENUM (
    'whatsapp'
);


ALTER TYPE public.canal_otp OWNER TO saludya_user;

--
-- Name: estado_afiliacion; Type: TYPE; Schema: public; Owner: saludya_user
--

CREATE TYPE public.estado_afiliacion AS ENUM (
    'pendiente',
    'activa',
    'no_encontrada'
);


ALTER TYPE public.estado_afiliacion OWNER TO saludya_user;

--
-- Name: estado_cita; Type: TYPE; Schema: public; Owner: saludya_user
--

CREATE TYPE public.estado_cita AS ENUM (
    'confirmada'
);


ALTER TYPE public.estado_cita OWNER TO saludya_user;

--
-- Name: estado_disponibilidad; Type: TYPE; Schema: public; Owner: saludya_user
--

CREATE TYPE public.estado_disponibilidad AS ENUM (
    'disponible',
    'reservado'
);


ALTER TYPE public.estado_disponibilidad OWNER TO saludya_user;

--
-- Name: estado_otp; Type: TYPE; Schema: public; Owner: saludya_user
--

CREATE TYPE public.estado_otp AS ENUM (
    'pendiente',
    'usado',
    'expirado',
    'invalidado'
);


ALTER TYPE public.estado_otp OWNER TO saludya_user;

--
-- Name: modalidad; Type: TYPE; Schema: public; Owner: saludya_user
--

CREATE TYPE public.modalidad AS ENUM (
    'presencial',
    'virtual'
);


ALTER TYPE public.modalidad OWNER TO saludya_user;

--
-- Name: tipo_documento; Type: TYPE; Schema: public; Owner: saludya_user
--

CREATE TYPE public.tipo_documento AS ENUM (
    'cedula_ciudadania',
    'cedula_extranjeria',
    'tarjeta_identidad',
    'pasaporte'
);


ALTER TYPE public.tipo_documento OWNER TO saludya_user;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: alembic_version; Type: TABLE; Schema: public; Owner: saludya_user
--

CREATE TABLE public.alembic_version (
    version_num character varying(32) NOT NULL
);


ALTER TABLE public.alembic_version OWNER TO saludya_user;

--
-- Name: citas; Type: TABLE; Schema: public; Owner: saludya_user
--

CREATE TABLE public.citas (
    id uuid NOT NULL,
    paciente_id uuid NOT NULL,
    disponibilidad_id uuid NOT NULL,
    canal_recordatorio public.canal_contacto NOT NULL,
    estado public.estado_cita NOT NULL,
    creado_en timestamp with time zone NOT NULL,
    numero_comprobante character varying(20),
    canal_envio_comprobante public.canal_contacto,
    comprobante_generado_en timestamp with time zone
);


ALTER TABLE public.citas OWNER TO saludya_user;

--
-- Name: codigos_otp; Type: TABLE; Schema: public; Owner: saludya_user
--

CREATE TABLE public.codigos_otp (
    id uuid NOT NULL,
    paciente_id uuid NOT NULL,
    codigo character varying(6) NOT NULL,
    canal public.canal_otp NOT NULL,
    estado public.estado_otp NOT NULL,
    intentos_realizados integer NOT NULL,
    creado_en timestamp with time zone NOT NULL,
    expira_en timestamp with time zone NOT NULL
);


ALTER TABLE public.codigos_otp OWNER TO saludya_user;

--
-- Name: disponibilidad; Type: TABLE; Schema: public; Owner: saludya_user
--

CREATE TABLE public.disponibilidad (
    id uuid NOT NULL,
    especialista_id uuid NOT NULL,
    sede_id uuid NOT NULL,
    modalidad public.modalidad NOT NULL,
    fecha date NOT NULL,
    hora time without time zone NOT NULL,
    estado public.estado_disponibilidad NOT NULL
);


ALTER TABLE public.disponibilidad OWNER TO saludya_user;

--
-- Name: eps; Type: TABLE; Schema: public; Owner: saludya_user
--

CREATE TABLE public.eps (
    id uuid NOT NULL,
    nombre character varying(120) NOT NULL
);


ALTER TABLE public.eps OWNER TO saludya_user;

--
-- Name: especialidades; Type: TABLE; Schema: public; Owner: saludya_user
--

CREATE TABLE public.especialidades (
    id uuid NOT NULL,
    nombre character varying(80) NOT NULL
);


ALTER TABLE public.especialidades OWNER TO saludya_user;

--
-- Name: especialista_modalidades; Type: TABLE; Schema: public; Owner: saludya_user
--

CREATE TABLE public.especialista_modalidades (
    especialista_id uuid NOT NULL,
    modalidad public.modalidad NOT NULL
);


ALTER TABLE public.especialista_modalidades OWNER TO saludya_user;

--
-- Name: especialista_sedes; Type: TABLE; Schema: public; Owner: saludya_user
--

CREATE TABLE public.especialista_sedes (
    especialista_id uuid NOT NULL,
    sede_id uuid NOT NULL
);


ALTER TABLE public.especialista_sedes OWNER TO saludya_user;

--
-- Name: especialistas; Type: TABLE; Schema: public; Owner: saludya_user
--

CREATE TABLE public.especialistas (
    id uuid NOT NULL,
    nombre character varying(150) NOT NULL,
    especialidad_id uuid NOT NULL
);


ALTER TABLE public.especialistas OWNER TO saludya_user;

--
-- Name: pacientes; Type: TABLE; Schema: public; Owner: saludya_user
--

CREATE TABLE public.pacientes (
    id uuid NOT NULL,
    tipo_documento public.tipo_documento NOT NULL,
    numero_documento character varying(20) NOT NULL,
    nombre character varying(150) NOT NULL,
    telefono_whatsapp character varying(20) NOT NULL,
    correo character varying(150),
    acepto_tratamiento_datos boolean NOT NULL,
    fecha_aceptacion_tratamiento timestamp with time zone,
    eps_id uuid,
    estado_afiliacion public.estado_afiliacion NOT NULL,
    creado_en timestamp with time zone NOT NULL
);


ALTER TABLE public.pacientes OWNER TO saludya_user;

--
-- Name: sedes; Type: TABLE; Schema: public; Owner: saludya_user
--

CREATE TABLE public.sedes (
    id uuid NOT NULL,
    nombre character varying(100) NOT NULL,
    ciudad character varying(80) NOT NULL
);


ALTER TABLE public.sedes OWNER TO saludya_user;

--
-- Data for Name: alembic_version; Type: TABLE DATA; Schema: public; Owner: saludya_user
--

COPY public.alembic_version (version_num) FROM stdin;
68c2843c218e
\.


--
-- Data for Name: citas; Type: TABLE DATA; Schema: public; Owner: saludya_user
--

COPY public.citas (id, paciente_id, disponibilidad_id, canal_recordatorio, estado, creado_en, numero_comprobante, canal_envio_comprobante, comprobante_generado_en) FROM stdin;
\.


--
-- Data for Name: codigos_otp; Type: TABLE DATA; Schema: public; Owner: saludya_user
--

COPY public.codigos_otp (id, paciente_id, codigo, canal, estado, intentos_realizados, creado_en, expira_en) FROM stdin;
\.


--
-- Data for Name: disponibilidad; Type: TABLE DATA; Schema: public; Owner: saludya_user
--

COPY public.disponibilidad (id, especialista_id, sede_id, modalidad, fecha, hora, estado) FROM stdin;
ea4306bf-a989-444c-a5a1-cc7fd05b0846	3c6202d4-4eb8-41d2-924b-000779aabc40	5bd59151-72fa-4c64-961b-564723325167	presencial	2026-09-28	08:00:00	reservado
4788194d-60f6-4b2e-a50f-8983fde96ac9	3c6202d4-4eb8-41d2-924b-000779aabc40	5bd59151-72fa-4c64-961b-564723325167	presencial	2026-09-28	10:00:00	disponible
f32427ce-9cc9-4c8d-8b1c-890fdca2a2c8	3c6202d4-4eb8-41d2-924b-000779aabc40	5bd59151-72fa-4c64-961b-564723325167	presencial	2026-09-28	15:00:00	disponible
0f7cd663-4edf-488f-ae6e-297c09f1aabc	3c6202d4-4eb8-41d2-924b-000779aabc40	5bd59151-72fa-4c64-961b-564723325167	presencial	2026-09-29	08:00:00	reservado
e2da3f34-278f-4193-a115-7efe66d42bcd	3c6202d4-4eb8-41d2-924b-000779aabc40	5bd59151-72fa-4c64-961b-564723325167	presencial	2026-09-29	10:00:00	disponible
1b1c8848-708a-4bd3-98d3-cdb786e750df	3c6202d4-4eb8-41d2-924b-000779aabc40	5bd59151-72fa-4c64-961b-564723325167	presencial	2026-09-29	15:00:00	disponible
26d04770-672b-4211-a02b-e70fee93ea5f	3c6202d4-4eb8-41d2-924b-000779aabc40	5bd59151-72fa-4c64-961b-564723325167	presencial	2026-09-30	08:00:00	reservado
af3b05c4-9ed5-4abe-9261-b774db157c81	3c6202d4-4eb8-41d2-924b-000779aabc40	5bd59151-72fa-4c64-961b-564723325167	presencial	2026-09-30	10:00:00	disponible
c17c6bfe-97a0-4fb1-b114-c518d640446a	3c6202d4-4eb8-41d2-924b-000779aabc40	5bd59151-72fa-4c64-961b-564723325167	presencial	2026-09-30	15:00:00	disponible
bc66983f-6003-4205-8d81-b0613f4f81fe	3c6202d4-4eb8-41d2-924b-000779aabc40	5bd59151-72fa-4c64-961b-564723325167	presencial	2026-10-01	08:00:00	reservado
f981764b-4a34-43f5-9751-a6dc6186643c	3c6202d4-4eb8-41d2-924b-000779aabc40	5bd59151-72fa-4c64-961b-564723325167	presencial	2026-10-01	10:00:00	disponible
5aec6e3f-77f5-4ca1-9266-c3e3f0207c0c	3c6202d4-4eb8-41d2-924b-000779aabc40	5bd59151-72fa-4c64-961b-564723325167	presencial	2026-10-01	15:00:00	disponible
86b26c64-5822-42d6-930d-68cf46dafb43	3c6202d4-4eb8-41d2-924b-000779aabc40	5bd59151-72fa-4c64-961b-564723325167	presencial	2026-10-02	08:00:00	reservado
09cef449-3bec-41ca-a3f6-9ac293d36ab9	3c6202d4-4eb8-41d2-924b-000779aabc40	5bd59151-72fa-4c64-961b-564723325167	presencial	2026-10-02	10:00:00	disponible
4c2a7791-25d8-49ea-82d7-cdd88aacc4aa	3c6202d4-4eb8-41d2-924b-000779aabc40	5bd59151-72fa-4c64-961b-564723325167	presencial	2026-10-02	15:00:00	disponible
26ec3296-9500-4f39-a1fd-c3a06c3ca35f	3c6202d4-4eb8-41d2-924b-000779aabc40	5bd59151-72fa-4c64-961b-564723325167	virtual	2026-09-28	08:00:00	reservado
a1b995b3-ef9c-411a-b5e4-8ab91a5166c5	3c6202d4-4eb8-41d2-924b-000779aabc40	5bd59151-72fa-4c64-961b-564723325167	virtual	2026-09-28	10:00:00	disponible
34dc6404-a00c-42c1-9435-95208cc6e0fb	3c6202d4-4eb8-41d2-924b-000779aabc40	5bd59151-72fa-4c64-961b-564723325167	virtual	2026-09-28	15:00:00	disponible
7e73999c-bb77-4a4c-aac0-53ea057bb812	3c6202d4-4eb8-41d2-924b-000779aabc40	5bd59151-72fa-4c64-961b-564723325167	virtual	2026-09-29	08:00:00	reservado
96dc9954-db46-47e8-b24d-5d11b9b3ecd5	3c6202d4-4eb8-41d2-924b-000779aabc40	5bd59151-72fa-4c64-961b-564723325167	virtual	2026-09-29	10:00:00	disponible
fcf6638e-83c7-4b46-90bb-704dfdc6c367	3c6202d4-4eb8-41d2-924b-000779aabc40	5bd59151-72fa-4c64-961b-564723325167	virtual	2026-09-29	15:00:00	disponible
18ea9108-7173-4cd0-8996-971609c4b89d	3c6202d4-4eb8-41d2-924b-000779aabc40	5bd59151-72fa-4c64-961b-564723325167	virtual	2026-09-30	08:00:00	reservado
aefae339-2521-42e8-9f6a-178b0d6b299d	3c6202d4-4eb8-41d2-924b-000779aabc40	5bd59151-72fa-4c64-961b-564723325167	virtual	2026-09-30	10:00:00	disponible
bca54f44-54a9-40e9-b882-889655911b25	3c6202d4-4eb8-41d2-924b-000779aabc40	5bd59151-72fa-4c64-961b-564723325167	virtual	2026-09-30	15:00:00	disponible
3deafc35-7839-4cf7-aa4b-d9922f2dcbf0	3c6202d4-4eb8-41d2-924b-000779aabc40	5bd59151-72fa-4c64-961b-564723325167	virtual	2026-10-01	08:00:00	reservado
7b419c8e-8759-4a43-a9fe-60af86272b5b	3c6202d4-4eb8-41d2-924b-000779aabc40	5bd59151-72fa-4c64-961b-564723325167	virtual	2026-10-01	10:00:00	disponible
3d49ab61-523b-4040-80d3-965cd99fdf74	3c6202d4-4eb8-41d2-924b-000779aabc40	5bd59151-72fa-4c64-961b-564723325167	virtual	2026-10-01	15:00:00	disponible
c509b1b8-cf3a-4655-9ab6-068917da6b44	3c6202d4-4eb8-41d2-924b-000779aabc40	5bd59151-72fa-4c64-961b-564723325167	virtual	2026-10-02	08:00:00	reservado
97cb382f-2b7c-4fbe-ae78-76fb0a8ed26d	3c6202d4-4eb8-41d2-924b-000779aabc40	5bd59151-72fa-4c64-961b-564723325167	virtual	2026-10-02	10:00:00	disponible
fb296ef4-26bb-44f2-aac1-08dc0d397ac5	3c6202d4-4eb8-41d2-924b-000779aabc40	5bd59151-72fa-4c64-961b-564723325167	virtual	2026-10-02	15:00:00	disponible
f68bd54d-8120-496b-bc3a-737f1225833b	3c6202d4-4eb8-41d2-924b-000779aabc40	a96e8bdb-1952-46a2-99e9-0e48b89cfe9c	presencial	2026-09-28	08:00:00	reservado
82a44c8c-2822-4825-8fe5-471e4e0bf78b	3c6202d4-4eb8-41d2-924b-000779aabc40	a96e8bdb-1952-46a2-99e9-0e48b89cfe9c	presencial	2026-09-28	10:00:00	disponible
7b2ba7b0-bbfa-491a-8e89-a6a803bd9a6f	3c6202d4-4eb8-41d2-924b-000779aabc40	a96e8bdb-1952-46a2-99e9-0e48b89cfe9c	presencial	2026-09-28	15:00:00	disponible
2ad69ebb-268d-4a2c-9eeb-dab6a0fe3559	3c6202d4-4eb8-41d2-924b-000779aabc40	a96e8bdb-1952-46a2-99e9-0e48b89cfe9c	presencial	2026-09-29	08:00:00	reservado
38031b40-f13e-420b-8c24-43266975f1f0	3c6202d4-4eb8-41d2-924b-000779aabc40	a96e8bdb-1952-46a2-99e9-0e48b89cfe9c	presencial	2026-09-29	10:00:00	disponible
8e38c762-245a-42f3-bc54-39736d804abb	3c6202d4-4eb8-41d2-924b-000779aabc40	a96e8bdb-1952-46a2-99e9-0e48b89cfe9c	presencial	2026-09-29	15:00:00	disponible
4dcafcdd-4513-4582-9d96-be53e945db4b	3c6202d4-4eb8-41d2-924b-000779aabc40	a96e8bdb-1952-46a2-99e9-0e48b89cfe9c	presencial	2026-09-30	08:00:00	reservado
c14ca75b-9ecd-4178-a24b-3bd9155990fb	3c6202d4-4eb8-41d2-924b-000779aabc40	a96e8bdb-1952-46a2-99e9-0e48b89cfe9c	presencial	2026-09-30	10:00:00	disponible
2d333c8a-eb29-45a6-98f2-8925dde7b4d7	3c6202d4-4eb8-41d2-924b-000779aabc40	a96e8bdb-1952-46a2-99e9-0e48b89cfe9c	presencial	2026-09-30	15:00:00	disponible
f3bd45ed-5459-479d-ba87-a8ce41750216	3c6202d4-4eb8-41d2-924b-000779aabc40	a96e8bdb-1952-46a2-99e9-0e48b89cfe9c	presencial	2026-10-01	08:00:00	reservado
6bc145c4-3823-4baa-a8a1-6f6ddfa5a0fc	3c6202d4-4eb8-41d2-924b-000779aabc40	a96e8bdb-1952-46a2-99e9-0e48b89cfe9c	presencial	2026-10-01	10:00:00	disponible
649961a6-c749-498d-b4d2-619128a4f511	3c6202d4-4eb8-41d2-924b-000779aabc40	a96e8bdb-1952-46a2-99e9-0e48b89cfe9c	presencial	2026-10-01	15:00:00	disponible
e7e8e56a-91bd-4f5a-87fe-f26cb6f2105c	3c6202d4-4eb8-41d2-924b-000779aabc40	a96e8bdb-1952-46a2-99e9-0e48b89cfe9c	presencial	2026-10-02	08:00:00	reservado
fc1f8515-77b7-49c4-b926-29508b7be5ba	3c6202d4-4eb8-41d2-924b-000779aabc40	a96e8bdb-1952-46a2-99e9-0e48b89cfe9c	presencial	2026-10-02	10:00:00	disponible
dd23f1c9-f41c-4b9f-868f-10d224e6ab0e	3c6202d4-4eb8-41d2-924b-000779aabc40	a96e8bdb-1952-46a2-99e9-0e48b89cfe9c	presencial	2026-10-02	15:00:00	disponible
c2319d5d-a439-4034-b0e7-fe5f67f5361d	3c6202d4-4eb8-41d2-924b-000779aabc40	a96e8bdb-1952-46a2-99e9-0e48b89cfe9c	virtual	2026-09-28	08:00:00	reservado
b3e453b6-0106-400d-93cf-d39285ff6995	3c6202d4-4eb8-41d2-924b-000779aabc40	a96e8bdb-1952-46a2-99e9-0e48b89cfe9c	virtual	2026-09-28	10:00:00	disponible
77188bdd-b67f-4932-8afa-9a60d8aa937d	3c6202d4-4eb8-41d2-924b-000779aabc40	a96e8bdb-1952-46a2-99e9-0e48b89cfe9c	virtual	2026-09-28	15:00:00	disponible
febc280f-f49d-4bb6-9bbb-858e1c49b7d0	3c6202d4-4eb8-41d2-924b-000779aabc40	a96e8bdb-1952-46a2-99e9-0e48b89cfe9c	virtual	2026-09-29	08:00:00	reservado
49406330-0202-4b04-8564-9d53a85623b2	3c6202d4-4eb8-41d2-924b-000779aabc40	a96e8bdb-1952-46a2-99e9-0e48b89cfe9c	virtual	2026-09-29	10:00:00	disponible
8fed6c78-d4ac-4784-a818-e5401035210f	3c6202d4-4eb8-41d2-924b-000779aabc40	a96e8bdb-1952-46a2-99e9-0e48b89cfe9c	virtual	2026-09-29	15:00:00	disponible
1a2e84d3-6aae-4035-950d-bd35f9ee1522	3c6202d4-4eb8-41d2-924b-000779aabc40	a96e8bdb-1952-46a2-99e9-0e48b89cfe9c	virtual	2026-09-30	08:00:00	reservado
84e7ccfb-b348-4ef4-81b3-335ee61b3c7d	3c6202d4-4eb8-41d2-924b-000779aabc40	a96e8bdb-1952-46a2-99e9-0e48b89cfe9c	virtual	2026-09-30	10:00:00	disponible
4d20054f-6fe2-45b3-a003-a5817660a1da	3c6202d4-4eb8-41d2-924b-000779aabc40	a96e8bdb-1952-46a2-99e9-0e48b89cfe9c	virtual	2026-09-30	15:00:00	disponible
6c10eae1-e075-4a6b-8945-8464b9b3d03d	3c6202d4-4eb8-41d2-924b-000779aabc40	a96e8bdb-1952-46a2-99e9-0e48b89cfe9c	virtual	2026-10-01	08:00:00	reservado
d10d69f3-4e00-46c4-bcfd-b803d1c864c4	3c6202d4-4eb8-41d2-924b-000779aabc40	a96e8bdb-1952-46a2-99e9-0e48b89cfe9c	virtual	2026-10-01	10:00:00	disponible
340698a6-5a7a-409d-8e0d-c6b1c719ab87	3c6202d4-4eb8-41d2-924b-000779aabc40	a96e8bdb-1952-46a2-99e9-0e48b89cfe9c	virtual	2026-10-01	15:00:00	disponible
894ccda8-ddb0-47de-b432-00cdb10e4d41	3c6202d4-4eb8-41d2-924b-000779aabc40	a96e8bdb-1952-46a2-99e9-0e48b89cfe9c	virtual	2026-10-02	08:00:00	reservado
02c69054-86ff-4a3e-b10f-747489b7efce	3c6202d4-4eb8-41d2-924b-000779aabc40	a96e8bdb-1952-46a2-99e9-0e48b89cfe9c	virtual	2026-10-02	10:00:00	disponible
656dbf90-2f10-4c1b-b3a6-fa4a237caa35	3c6202d4-4eb8-41d2-924b-000779aabc40	a96e8bdb-1952-46a2-99e9-0e48b89cfe9c	virtual	2026-10-02	15:00:00	disponible
83738bc0-0072-4e60-9a64-aa305caeb6d9	4743fd24-cba6-45dc-9283-3835d94a22ce	5bd59151-72fa-4c64-961b-564723325167	presencial	2026-09-28	08:00:00	reservado
c9d6dc4c-bace-45c2-9cff-9db5468828db	4743fd24-cba6-45dc-9283-3835d94a22ce	5bd59151-72fa-4c64-961b-564723325167	presencial	2026-09-28	10:00:00	disponible
e515cecc-d751-4f74-b6d2-1afd7992aa76	4743fd24-cba6-45dc-9283-3835d94a22ce	5bd59151-72fa-4c64-961b-564723325167	presencial	2026-09-28	15:00:00	disponible
7587771f-1175-41c4-a518-6af9a83df5fd	4743fd24-cba6-45dc-9283-3835d94a22ce	5bd59151-72fa-4c64-961b-564723325167	presencial	2026-09-29	08:00:00	reservado
a5d689f1-59af-4252-8302-87e88d044574	4743fd24-cba6-45dc-9283-3835d94a22ce	5bd59151-72fa-4c64-961b-564723325167	presencial	2026-09-29	10:00:00	disponible
d748b273-854e-454f-a77a-07ceba824687	4743fd24-cba6-45dc-9283-3835d94a22ce	5bd59151-72fa-4c64-961b-564723325167	presencial	2026-09-29	15:00:00	disponible
c60f0dd2-f62a-4cb3-bfef-8947520e532c	4743fd24-cba6-45dc-9283-3835d94a22ce	5bd59151-72fa-4c64-961b-564723325167	presencial	2026-09-30	08:00:00	reservado
f2b14117-a052-4081-ac64-c54fdc5534b6	4743fd24-cba6-45dc-9283-3835d94a22ce	5bd59151-72fa-4c64-961b-564723325167	presencial	2026-09-30	10:00:00	disponible
90ce9c1e-b023-4ce4-9252-1598183d27d9	4743fd24-cba6-45dc-9283-3835d94a22ce	5bd59151-72fa-4c64-961b-564723325167	presencial	2026-09-30	15:00:00	disponible
379ad5c8-9b4a-436f-921e-3e2ad5104618	4743fd24-cba6-45dc-9283-3835d94a22ce	5bd59151-72fa-4c64-961b-564723325167	presencial	2026-10-01	08:00:00	reservado
aebe9ad8-c9bd-4c53-8170-b27fdb316bb4	4743fd24-cba6-45dc-9283-3835d94a22ce	5bd59151-72fa-4c64-961b-564723325167	presencial	2026-10-01	10:00:00	disponible
011c4571-0ed7-48f7-87b2-9292ba2c041a	4743fd24-cba6-45dc-9283-3835d94a22ce	5bd59151-72fa-4c64-961b-564723325167	presencial	2026-10-01	15:00:00	disponible
93517baa-9f68-499f-a597-1df5630239da	4743fd24-cba6-45dc-9283-3835d94a22ce	5bd59151-72fa-4c64-961b-564723325167	presencial	2026-10-02	08:00:00	reservado
1ac85dc6-b39a-46de-bdf8-8587184aa1be	4743fd24-cba6-45dc-9283-3835d94a22ce	5bd59151-72fa-4c64-961b-564723325167	presencial	2026-10-02	10:00:00	disponible
7909aba9-795e-43be-958c-95aaaf13d3c5	4743fd24-cba6-45dc-9283-3835d94a22ce	5bd59151-72fa-4c64-961b-564723325167	presencial	2026-10-02	15:00:00	disponible
bb9f18d7-58df-4f3c-894e-632f04283a01	9b1cf0ed-6df4-4717-8d74-198934d3caa3	5bd59151-72fa-4c64-961b-564723325167	presencial	2026-09-28	08:00:00	reservado
a5ada2c6-d7ad-4ba4-b0e3-16cf3868020b	9b1cf0ed-6df4-4717-8d74-198934d3caa3	5bd59151-72fa-4c64-961b-564723325167	presencial	2026-09-28	10:00:00	disponible
b1022aae-05b5-47de-b88f-577bf4d9c668	9b1cf0ed-6df4-4717-8d74-198934d3caa3	5bd59151-72fa-4c64-961b-564723325167	presencial	2026-09-28	15:00:00	disponible
dd062681-754d-4183-b286-6bab26030e89	9b1cf0ed-6df4-4717-8d74-198934d3caa3	5bd59151-72fa-4c64-961b-564723325167	presencial	2026-09-29	08:00:00	reservado
90c5b2b2-c9b1-4119-89ce-e690a97675cb	9b1cf0ed-6df4-4717-8d74-198934d3caa3	5bd59151-72fa-4c64-961b-564723325167	presencial	2026-09-29	10:00:00	disponible
7579fcc5-33ce-46d5-99b6-2a24c5ac2ec8	9b1cf0ed-6df4-4717-8d74-198934d3caa3	5bd59151-72fa-4c64-961b-564723325167	presencial	2026-09-29	15:00:00	disponible
a9642ba4-8cbc-4899-a07f-e54863ac9095	9b1cf0ed-6df4-4717-8d74-198934d3caa3	5bd59151-72fa-4c64-961b-564723325167	presencial	2026-09-30	08:00:00	reservado
4d2703a0-afd1-4208-b8a5-c1ca011ca22e	9b1cf0ed-6df4-4717-8d74-198934d3caa3	5bd59151-72fa-4c64-961b-564723325167	presencial	2026-09-30	10:00:00	disponible
575e1330-061b-4148-94ca-377d6db7fe5e	9b1cf0ed-6df4-4717-8d74-198934d3caa3	5bd59151-72fa-4c64-961b-564723325167	presencial	2026-09-30	15:00:00	disponible
b96b292a-6db8-4ac2-91e9-c0e9ecfe5aac	9b1cf0ed-6df4-4717-8d74-198934d3caa3	5bd59151-72fa-4c64-961b-564723325167	presencial	2026-10-01	08:00:00	reservado
a1682aa9-d92a-4462-8bb1-e8e7b0b60c3b	9b1cf0ed-6df4-4717-8d74-198934d3caa3	5bd59151-72fa-4c64-961b-564723325167	presencial	2026-10-01	10:00:00	disponible
8a6cb9b0-0435-4161-9a89-8fe37ea77220	9b1cf0ed-6df4-4717-8d74-198934d3caa3	5bd59151-72fa-4c64-961b-564723325167	presencial	2026-10-01	15:00:00	disponible
104dffd9-6701-4675-a745-7fbddeef7fb9	9b1cf0ed-6df4-4717-8d74-198934d3caa3	5bd59151-72fa-4c64-961b-564723325167	presencial	2026-10-02	08:00:00	reservado
34c9c88f-a135-4fa1-b166-891d893a1391	9b1cf0ed-6df4-4717-8d74-198934d3caa3	5bd59151-72fa-4c64-961b-564723325167	presencial	2026-10-02	10:00:00	disponible
7df35dcf-a4c7-4b8b-a505-6457aa007013	9b1cf0ed-6df4-4717-8d74-198934d3caa3	5bd59151-72fa-4c64-961b-564723325167	presencial	2026-10-02	15:00:00	disponible
a5952a17-3d3d-4f6d-9d6c-87db48752ff8	9b1cf0ed-6df4-4717-8d74-198934d3caa3	5bd59151-72fa-4c64-961b-564723325167	virtual	2026-09-28	08:00:00	reservado
4f7dfc00-e6c2-4ecd-a695-cfd3e8c44802	9b1cf0ed-6df4-4717-8d74-198934d3caa3	5bd59151-72fa-4c64-961b-564723325167	virtual	2026-09-28	10:00:00	disponible
68c31a07-a4a2-4b5d-9433-0589459abdab	9b1cf0ed-6df4-4717-8d74-198934d3caa3	5bd59151-72fa-4c64-961b-564723325167	virtual	2026-09-28	15:00:00	disponible
16952a76-ad34-4a8b-a397-b7e214fce97c	9b1cf0ed-6df4-4717-8d74-198934d3caa3	5bd59151-72fa-4c64-961b-564723325167	virtual	2026-09-29	08:00:00	reservado
d0b7efc0-1f40-45c5-b5b0-430a8f0c7fae	9b1cf0ed-6df4-4717-8d74-198934d3caa3	5bd59151-72fa-4c64-961b-564723325167	virtual	2026-09-29	10:00:00	disponible
598ce7bc-54d1-4e3a-9c3a-2dd69333a13a	9b1cf0ed-6df4-4717-8d74-198934d3caa3	5bd59151-72fa-4c64-961b-564723325167	virtual	2026-09-29	15:00:00	disponible
43373225-8890-47af-91b3-cc1e5f7365cf	9b1cf0ed-6df4-4717-8d74-198934d3caa3	5bd59151-72fa-4c64-961b-564723325167	virtual	2026-09-30	08:00:00	reservado
12141c08-b16a-4c33-a3fc-9f7f63e08fdd	9b1cf0ed-6df4-4717-8d74-198934d3caa3	5bd59151-72fa-4c64-961b-564723325167	virtual	2026-09-30	10:00:00	disponible
b27137a1-68bf-45b8-9e86-ffc46b149dc8	9b1cf0ed-6df4-4717-8d74-198934d3caa3	5bd59151-72fa-4c64-961b-564723325167	virtual	2026-09-30	15:00:00	disponible
71a714dd-7c3a-461f-8f41-eea5d327cfb1	9b1cf0ed-6df4-4717-8d74-198934d3caa3	5bd59151-72fa-4c64-961b-564723325167	virtual	2026-10-01	08:00:00	reservado
1bd3bb09-7ee3-413b-a880-e61609c5fa8b	9b1cf0ed-6df4-4717-8d74-198934d3caa3	5bd59151-72fa-4c64-961b-564723325167	virtual	2026-10-01	10:00:00	disponible
e0eeaf9f-110d-4494-8edc-bd8440252927	9b1cf0ed-6df4-4717-8d74-198934d3caa3	5bd59151-72fa-4c64-961b-564723325167	virtual	2026-10-01	15:00:00	disponible
6b2a7fef-9d48-4591-b906-bc1e89c27810	9b1cf0ed-6df4-4717-8d74-198934d3caa3	5bd59151-72fa-4c64-961b-564723325167	virtual	2026-10-02	08:00:00	reservado
492a29c6-0c25-4c91-9321-9467a4dffa74	9b1cf0ed-6df4-4717-8d74-198934d3caa3	5bd59151-72fa-4c64-961b-564723325167	virtual	2026-10-02	10:00:00	disponible
60f71943-29f7-4336-9bb7-993ebc807ee6	9b1cf0ed-6df4-4717-8d74-198934d3caa3	5bd59151-72fa-4c64-961b-564723325167	virtual	2026-10-02	15:00:00	disponible
e2ecaeb8-4b44-4a04-9064-9842d19cd201	9b1cf0ed-6df4-4717-8d74-198934d3caa3	d4163144-7bec-40f6-9d70-645bd35f7285	presencial	2026-09-28	08:00:00	reservado
9c97749d-a32e-4b04-a7e8-712ad888a4d4	9b1cf0ed-6df4-4717-8d74-198934d3caa3	d4163144-7bec-40f6-9d70-645bd35f7285	presencial	2026-09-28	10:00:00	disponible
76d6c3fe-9856-4dc5-aa02-c0f1db6f994a	9b1cf0ed-6df4-4717-8d74-198934d3caa3	d4163144-7bec-40f6-9d70-645bd35f7285	presencial	2026-09-28	15:00:00	disponible
38ef58df-3589-4bac-8db3-e6fcc66b7ef8	9b1cf0ed-6df4-4717-8d74-198934d3caa3	d4163144-7bec-40f6-9d70-645bd35f7285	presencial	2026-09-29	08:00:00	reservado
e1d08658-ce1d-4aa1-8f0a-ff6f1bb0cc62	9b1cf0ed-6df4-4717-8d74-198934d3caa3	d4163144-7bec-40f6-9d70-645bd35f7285	presencial	2026-09-29	10:00:00	disponible
e0c7c624-03e5-4e84-bab1-daa48a33a4f3	9b1cf0ed-6df4-4717-8d74-198934d3caa3	d4163144-7bec-40f6-9d70-645bd35f7285	presencial	2026-09-29	15:00:00	disponible
5c44e877-1454-487d-a34a-e82a3c787d98	9b1cf0ed-6df4-4717-8d74-198934d3caa3	d4163144-7bec-40f6-9d70-645bd35f7285	presencial	2026-09-30	08:00:00	reservado
a487396d-6b1c-464c-afdd-1eb7c8ec7580	9b1cf0ed-6df4-4717-8d74-198934d3caa3	d4163144-7bec-40f6-9d70-645bd35f7285	presencial	2026-09-30	10:00:00	disponible
dea797b5-46bf-4ebe-bc07-cbc40c88dbd6	9b1cf0ed-6df4-4717-8d74-198934d3caa3	d4163144-7bec-40f6-9d70-645bd35f7285	presencial	2026-09-30	15:00:00	disponible
62808990-2ebd-4e37-aa9d-26b55bc3243c	9b1cf0ed-6df4-4717-8d74-198934d3caa3	d4163144-7bec-40f6-9d70-645bd35f7285	presencial	2026-10-01	08:00:00	reservado
2c2dc475-68fe-4150-89e9-bacb9e48c870	9b1cf0ed-6df4-4717-8d74-198934d3caa3	d4163144-7bec-40f6-9d70-645bd35f7285	presencial	2026-10-01	10:00:00	disponible
9de7846b-d069-4f0c-8990-8681a0026e36	9b1cf0ed-6df4-4717-8d74-198934d3caa3	d4163144-7bec-40f6-9d70-645bd35f7285	presencial	2026-10-01	15:00:00	disponible
385843f5-d4ab-4b86-83d5-7e40164c72f6	9b1cf0ed-6df4-4717-8d74-198934d3caa3	d4163144-7bec-40f6-9d70-645bd35f7285	presencial	2026-10-02	08:00:00	reservado
b251640b-ab53-4b7d-ab30-019be51e2f89	9b1cf0ed-6df4-4717-8d74-198934d3caa3	d4163144-7bec-40f6-9d70-645bd35f7285	presencial	2026-10-02	10:00:00	disponible
0149a0ac-6190-4224-a6de-d1be68f20378	9b1cf0ed-6df4-4717-8d74-198934d3caa3	d4163144-7bec-40f6-9d70-645bd35f7285	presencial	2026-10-02	15:00:00	disponible
3f7879cf-d70d-4071-a6c1-cb21e7a7d60d	9b1cf0ed-6df4-4717-8d74-198934d3caa3	d4163144-7bec-40f6-9d70-645bd35f7285	virtual	2026-09-28	08:00:00	reservado
7d4a471d-0ac9-4b96-83b0-c433e8982617	9b1cf0ed-6df4-4717-8d74-198934d3caa3	d4163144-7bec-40f6-9d70-645bd35f7285	virtual	2026-09-28	10:00:00	disponible
92095c3d-fabb-4c9a-a795-008e25b7dbaf	9b1cf0ed-6df4-4717-8d74-198934d3caa3	d4163144-7bec-40f6-9d70-645bd35f7285	virtual	2026-09-28	15:00:00	disponible
1811c428-061e-4096-a7b1-e09ae9da339a	9b1cf0ed-6df4-4717-8d74-198934d3caa3	d4163144-7bec-40f6-9d70-645bd35f7285	virtual	2026-09-29	08:00:00	reservado
59e48cba-522f-4455-bac8-c25f28b873a1	9b1cf0ed-6df4-4717-8d74-198934d3caa3	d4163144-7bec-40f6-9d70-645bd35f7285	virtual	2026-09-29	10:00:00	disponible
f15aacd6-b003-4457-8414-47cc160260c1	9b1cf0ed-6df4-4717-8d74-198934d3caa3	d4163144-7bec-40f6-9d70-645bd35f7285	virtual	2026-09-29	15:00:00	disponible
73620ed4-94c6-4d42-9206-5ed5c0c08862	9b1cf0ed-6df4-4717-8d74-198934d3caa3	d4163144-7bec-40f6-9d70-645bd35f7285	virtual	2026-09-30	08:00:00	reservado
2b0422b2-7723-47c7-ab8b-a7e9c44e07a7	9b1cf0ed-6df4-4717-8d74-198934d3caa3	d4163144-7bec-40f6-9d70-645bd35f7285	virtual	2026-09-30	10:00:00	disponible
211f2cde-a5f9-4cfc-bb27-d8adecda0b56	9b1cf0ed-6df4-4717-8d74-198934d3caa3	d4163144-7bec-40f6-9d70-645bd35f7285	virtual	2026-09-30	15:00:00	disponible
728c61d5-7753-4244-bd97-a40b010c702e	9b1cf0ed-6df4-4717-8d74-198934d3caa3	d4163144-7bec-40f6-9d70-645bd35f7285	virtual	2026-10-01	08:00:00	reservado
5ebd12f9-7dfd-4ed9-b3fc-78b3acb34bfa	9b1cf0ed-6df4-4717-8d74-198934d3caa3	d4163144-7bec-40f6-9d70-645bd35f7285	virtual	2026-10-01	10:00:00	disponible
801504c9-7b04-4a63-acd2-44cee36beec0	9b1cf0ed-6df4-4717-8d74-198934d3caa3	d4163144-7bec-40f6-9d70-645bd35f7285	virtual	2026-10-01	15:00:00	disponible
55d04f61-8603-485c-92cd-28cb70b914bb	9b1cf0ed-6df4-4717-8d74-198934d3caa3	d4163144-7bec-40f6-9d70-645bd35f7285	virtual	2026-10-02	08:00:00	reservado
40b4bd9c-4bb7-46d1-b86b-c26ddf2e785c	9b1cf0ed-6df4-4717-8d74-198934d3caa3	d4163144-7bec-40f6-9d70-645bd35f7285	virtual	2026-10-02	10:00:00	disponible
c9acff20-44be-49e0-b30f-d40672cec314	9b1cf0ed-6df4-4717-8d74-198934d3caa3	d4163144-7bec-40f6-9d70-645bd35f7285	virtual	2026-10-02	15:00:00	disponible
6b00e86c-7503-47e8-a04a-0d927817b9d3	55d95322-d668-4b35-b133-b7a5a51e2fb5	a96e8bdb-1952-46a2-99e9-0e48b89cfe9c	presencial	2026-09-28	08:00:00	reservado
26a6a1ed-bb6c-43f5-aacf-b13da9cf59cf	55d95322-d668-4b35-b133-b7a5a51e2fb5	a96e8bdb-1952-46a2-99e9-0e48b89cfe9c	presencial	2026-09-28	10:00:00	disponible
23332b01-8adf-4bad-a0af-fd37aeb4bc93	55d95322-d668-4b35-b133-b7a5a51e2fb5	a96e8bdb-1952-46a2-99e9-0e48b89cfe9c	presencial	2026-09-28	15:00:00	disponible
930a060f-1729-4fea-94ad-6000cbb2c29f	55d95322-d668-4b35-b133-b7a5a51e2fb5	a96e8bdb-1952-46a2-99e9-0e48b89cfe9c	presencial	2026-09-29	08:00:00	reservado
2d847283-7771-4842-a7e1-e28a1e6fe06a	55d95322-d668-4b35-b133-b7a5a51e2fb5	a96e8bdb-1952-46a2-99e9-0e48b89cfe9c	presencial	2026-09-29	10:00:00	disponible
0dc52a14-cdaf-4130-bb47-150163a67119	55d95322-d668-4b35-b133-b7a5a51e2fb5	a96e8bdb-1952-46a2-99e9-0e48b89cfe9c	presencial	2026-09-29	15:00:00	disponible
e6a04673-caa3-4ae2-9916-5c589da06598	55d95322-d668-4b35-b133-b7a5a51e2fb5	a96e8bdb-1952-46a2-99e9-0e48b89cfe9c	presencial	2026-09-30	08:00:00	reservado
5182b08f-a7b8-4ed1-850c-190c7ee41071	55d95322-d668-4b35-b133-b7a5a51e2fb5	a96e8bdb-1952-46a2-99e9-0e48b89cfe9c	presencial	2026-09-30	10:00:00	disponible
9f1c8551-1f78-4fca-9632-94252891af9f	55d95322-d668-4b35-b133-b7a5a51e2fb5	a96e8bdb-1952-46a2-99e9-0e48b89cfe9c	presencial	2026-09-30	15:00:00	disponible
880dec27-30da-4aae-87be-4862e1cf30dc	55d95322-d668-4b35-b133-b7a5a51e2fb5	a96e8bdb-1952-46a2-99e9-0e48b89cfe9c	presencial	2026-10-01	08:00:00	reservado
2e5e5556-504b-4b63-9e64-b16873df5041	55d95322-d668-4b35-b133-b7a5a51e2fb5	a96e8bdb-1952-46a2-99e9-0e48b89cfe9c	presencial	2026-10-01	10:00:00	disponible
fffe9e22-84dc-4b3a-a8a4-84a035f0ca50	55d95322-d668-4b35-b133-b7a5a51e2fb5	a96e8bdb-1952-46a2-99e9-0e48b89cfe9c	presencial	2026-10-01	15:00:00	disponible
6a8589e3-8cf3-4637-9914-abd66c7e5a2b	55d95322-d668-4b35-b133-b7a5a51e2fb5	a96e8bdb-1952-46a2-99e9-0e48b89cfe9c	presencial	2026-10-02	08:00:00	reservado
fe8dc3a6-e274-4fb4-8b66-5fb761b90875	55d95322-d668-4b35-b133-b7a5a51e2fb5	a96e8bdb-1952-46a2-99e9-0e48b89cfe9c	presencial	2026-10-02	10:00:00	disponible
1a10c85d-681d-4de5-9e8a-419431449607	55d95322-d668-4b35-b133-b7a5a51e2fb5	a96e8bdb-1952-46a2-99e9-0e48b89cfe9c	presencial	2026-10-02	15:00:00	disponible
65c8fcf8-999a-4a5b-8930-6a9a362d3f0e	8f1d7f06-f351-4b5d-bd73-aca83253a705	d4163144-7bec-40f6-9d70-645bd35f7285	presencial	2026-09-28	08:00:00	reservado
bf465e9b-3ab0-4233-9ecd-90623f475177	8f1d7f06-f351-4b5d-bd73-aca83253a705	d4163144-7bec-40f6-9d70-645bd35f7285	presencial	2026-09-28	10:00:00	disponible
38ce45d5-429e-498b-87a4-fedb45f43742	8f1d7f06-f351-4b5d-bd73-aca83253a705	d4163144-7bec-40f6-9d70-645bd35f7285	presencial	2026-09-28	15:00:00	disponible
e779d72b-d550-479d-9816-e480532b4c70	8f1d7f06-f351-4b5d-bd73-aca83253a705	d4163144-7bec-40f6-9d70-645bd35f7285	presencial	2026-09-29	08:00:00	reservado
ae8bb9da-887b-448b-8f07-ac9f2884487d	8f1d7f06-f351-4b5d-bd73-aca83253a705	d4163144-7bec-40f6-9d70-645bd35f7285	presencial	2026-09-29	10:00:00	disponible
16b8fa38-3aaa-4227-ad08-6731bddff023	8f1d7f06-f351-4b5d-bd73-aca83253a705	d4163144-7bec-40f6-9d70-645bd35f7285	presencial	2026-09-29	15:00:00	disponible
0fddcdf5-abf0-489d-b033-7a8d32b05985	8f1d7f06-f351-4b5d-bd73-aca83253a705	d4163144-7bec-40f6-9d70-645bd35f7285	presencial	2026-09-30	08:00:00	reservado
b496e7ee-fbcc-4008-8734-a84a6a45cb40	8f1d7f06-f351-4b5d-bd73-aca83253a705	d4163144-7bec-40f6-9d70-645bd35f7285	presencial	2026-09-30	10:00:00	disponible
4af15cda-e93d-400a-baf1-cb81078b8326	8f1d7f06-f351-4b5d-bd73-aca83253a705	d4163144-7bec-40f6-9d70-645bd35f7285	presencial	2026-09-30	15:00:00	disponible
c96eccc5-0c5e-4583-b609-824a3a0ffe59	8f1d7f06-f351-4b5d-bd73-aca83253a705	d4163144-7bec-40f6-9d70-645bd35f7285	presencial	2026-10-01	08:00:00	reservado
879da08d-1e9d-4384-9e50-5d5e6b77d695	8f1d7f06-f351-4b5d-bd73-aca83253a705	d4163144-7bec-40f6-9d70-645bd35f7285	presencial	2026-10-01	10:00:00	disponible
869bbbb5-4a87-4f61-82da-3e42ab412790	8f1d7f06-f351-4b5d-bd73-aca83253a705	d4163144-7bec-40f6-9d70-645bd35f7285	presencial	2026-10-01	15:00:00	disponible
825d0de7-b3a3-4d4b-a0af-bb2b2845f9ef	8f1d7f06-f351-4b5d-bd73-aca83253a705	d4163144-7bec-40f6-9d70-645bd35f7285	presencial	2026-10-02	08:00:00	reservado
d2cda0f3-d124-43d5-b150-6ba7c6d1d3c3	8f1d7f06-f351-4b5d-bd73-aca83253a705	d4163144-7bec-40f6-9d70-645bd35f7285	presencial	2026-10-02	10:00:00	disponible
a0691822-ec88-48d5-a4d5-0710161378a3	8f1d7f06-f351-4b5d-bd73-aca83253a705	d4163144-7bec-40f6-9d70-645bd35f7285	presencial	2026-10-02	15:00:00	disponible
\.


--
-- Data for Name: eps; Type: TABLE DATA; Schema: public; Owner: saludya_user
--

COPY public.eps (id, nombre) FROM stdin;
50a96f9e-2989-4436-9cae-9400c3af7007	EPS Sura
82566012-8425-4f59-84c3-76beb976ca9d	Sanitas
ae43cebb-a97b-4392-ac1e-b92ca55faf4c	Nueva EPS
387cac27-27f6-4472-bf9b-cc198baa246b	Compensar
ce2e9e47-5a7a-4212-94fa-97d04ef847e6	Salud Total
6297eb61-935e-4bd7-a2c1-6101baea8a55	Famisanar
\.


--
-- Data for Name: especialidades; Type: TABLE DATA; Schema: public; Owner: saludya_user
--

COPY public.especialidades (id, nombre) FROM stdin;
cb4bcd71-2d3d-4b04-a03b-8c80b1c5aabe	Cardiología
42da57f2-0db8-4025-9687-9b3576c328b9	Dermatología
d96c83dc-c76d-44e7-b0bd-904e3b10cf7a	Medicina General
bd88aa77-8411-4849-8862-73011ebb7a9a	Ortopedia
bde10b78-bee2-445c-ab51-5712c9c00be3	Pediatría
\.


--
-- Data for Name: especialista_modalidades; Type: TABLE DATA; Schema: public; Owner: saludya_user
--

COPY public.especialista_modalidades (especialista_id, modalidad) FROM stdin;
3c6202d4-4eb8-41d2-924b-000779aabc40	presencial
3c6202d4-4eb8-41d2-924b-000779aabc40	virtual
4743fd24-cba6-45dc-9283-3835d94a22ce	presencial
9b1cf0ed-6df4-4717-8d74-198934d3caa3	presencial
9b1cf0ed-6df4-4717-8d74-198934d3caa3	virtual
55d95322-d668-4b35-b133-b7a5a51e2fb5	presencial
8f1d7f06-f351-4b5d-bd73-aca83253a705	presencial
\.


--
-- Data for Name: especialista_sedes; Type: TABLE DATA; Schema: public; Owner: saludya_user
--

COPY public.especialista_sedes (especialista_id, sede_id) FROM stdin;
3c6202d4-4eb8-41d2-924b-000779aabc40	5bd59151-72fa-4c64-961b-564723325167
3c6202d4-4eb8-41d2-924b-000779aabc40	a96e8bdb-1952-46a2-99e9-0e48b89cfe9c
4743fd24-cba6-45dc-9283-3835d94a22ce	5bd59151-72fa-4c64-961b-564723325167
9b1cf0ed-6df4-4717-8d74-198934d3caa3	5bd59151-72fa-4c64-961b-564723325167
9b1cf0ed-6df4-4717-8d74-198934d3caa3	d4163144-7bec-40f6-9d70-645bd35f7285
55d95322-d668-4b35-b133-b7a5a51e2fb5	a96e8bdb-1952-46a2-99e9-0e48b89cfe9c
8f1d7f06-f351-4b5d-bd73-aca83253a705	d4163144-7bec-40f6-9d70-645bd35f7285
\.


--
-- Data for Name: especialistas; Type: TABLE DATA; Schema: public; Owner: saludya_user
--

COPY public.especialistas (id, nombre, especialidad_id) FROM stdin;
3c6202d4-4eb8-41d2-924b-000779aabc40	Dr. Carlos Ramírez	cb4bcd71-2d3d-4b04-a03b-8c80b1c5aabe
4743fd24-cba6-45dc-9283-3835d94a22ce	Dra. Ana Gómez	42da57f2-0db8-4025-9687-9b3576c328b9
9b1cf0ed-6df4-4717-8d74-198934d3caa3	Dr. Luis Torres	d96c83dc-c76d-44e7-b0bd-904e3b10cf7a
55d95322-d668-4b35-b133-b7a5a51e2fb5	Dra. Marcela Ruiz	bde10b78-bee2-445c-ab51-5712c9c00be3
8f1d7f06-f351-4b5d-bd73-aca83253a705	Dr. Andrés Salazar	bd88aa77-8411-4849-8862-73011ebb7a9a
\.


--
-- Data for Name: pacientes; Type: TABLE DATA; Schema: public; Owner: saludya_user
--

COPY public.pacientes (id, tipo_documento, numero_documento, nombre, telefono_whatsapp, correo, acepto_tratamiento_datos, fecha_aceptacion_tratamiento, eps_id, estado_afiliacion, creado_en) FROM stdin;
\.


--
-- Data for Name: sedes; Type: TABLE DATA; Schema: public; Owner: saludya_user
--

COPY public.sedes (id, nombre, ciudad) FROM stdin;
5bd59151-72fa-4c64-961b-564723325167	Sede Poblado	Medellín
a96e8bdb-1952-46a2-99e9-0e48b89cfe9c	Sede Laureles	Medellín
d4163144-7bec-40f6-9d70-645bd35f7285	Sede Envigado	Envigado
\.


--
-- Name: alembic_version alembic_version_pkc; Type: CONSTRAINT; Schema: public; Owner: saludya_user
--

ALTER TABLE ONLY public.alembic_version
    ADD CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num);


--
-- Name: citas citas_disponibilidad_id_key; Type: CONSTRAINT; Schema: public; Owner: saludya_user
--

ALTER TABLE ONLY public.citas
    ADD CONSTRAINT citas_disponibilidad_id_key UNIQUE (disponibilidad_id);


--
-- Name: citas citas_numero_comprobante_key; Type: CONSTRAINT; Schema: public; Owner: saludya_user
--

ALTER TABLE ONLY public.citas
    ADD CONSTRAINT citas_numero_comprobante_key UNIQUE (numero_comprobante);


--
-- Name: citas citas_pkey; Type: CONSTRAINT; Schema: public; Owner: saludya_user
--

ALTER TABLE ONLY public.citas
    ADD CONSTRAINT citas_pkey PRIMARY KEY (id);


--
-- Name: codigos_otp codigos_otp_pkey; Type: CONSTRAINT; Schema: public; Owner: saludya_user
--

ALTER TABLE ONLY public.codigos_otp
    ADD CONSTRAINT codigos_otp_pkey PRIMARY KEY (id);


--
-- Name: disponibilidad disponibilidad_pkey; Type: CONSTRAINT; Schema: public; Owner: saludya_user
--

ALTER TABLE ONLY public.disponibilidad
    ADD CONSTRAINT disponibilidad_pkey PRIMARY KEY (id);


--
-- Name: eps eps_nombre_key; Type: CONSTRAINT; Schema: public; Owner: saludya_user
--

ALTER TABLE ONLY public.eps
    ADD CONSTRAINT eps_nombre_key UNIQUE (nombre);


--
-- Name: eps eps_pkey; Type: CONSTRAINT; Schema: public; Owner: saludya_user
--

ALTER TABLE ONLY public.eps
    ADD CONSTRAINT eps_pkey PRIMARY KEY (id);


--
-- Name: especialidades especialidades_nombre_key; Type: CONSTRAINT; Schema: public; Owner: saludya_user
--

ALTER TABLE ONLY public.especialidades
    ADD CONSTRAINT especialidades_nombre_key UNIQUE (nombre);


--
-- Name: especialidades especialidades_pkey; Type: CONSTRAINT; Schema: public; Owner: saludya_user
--

ALTER TABLE ONLY public.especialidades
    ADD CONSTRAINT especialidades_pkey PRIMARY KEY (id);


--
-- Name: especialista_modalidades especialista_modalidades_pkey; Type: CONSTRAINT; Schema: public; Owner: saludya_user
--

ALTER TABLE ONLY public.especialista_modalidades
    ADD CONSTRAINT especialista_modalidades_pkey PRIMARY KEY (especialista_id, modalidad);


--
-- Name: especialista_sedes especialista_sedes_pkey; Type: CONSTRAINT; Schema: public; Owner: saludya_user
--

ALTER TABLE ONLY public.especialista_sedes
    ADD CONSTRAINT especialista_sedes_pkey PRIMARY KEY (especialista_id, sede_id);


--
-- Name: especialistas especialistas_pkey; Type: CONSTRAINT; Schema: public; Owner: saludya_user
--

ALTER TABLE ONLY public.especialistas
    ADD CONSTRAINT especialistas_pkey PRIMARY KEY (id);


--
-- Name: pacientes pacientes_pkey; Type: CONSTRAINT; Schema: public; Owner: saludya_user
--

ALTER TABLE ONLY public.pacientes
    ADD CONSTRAINT pacientes_pkey PRIMARY KEY (id);


--
-- Name: sedes sedes_pkey; Type: CONSTRAINT; Schema: public; Owner: saludya_user
--

ALTER TABLE ONLY public.sedes
    ADD CONSTRAINT sedes_pkey PRIMARY KEY (id);


--
-- Name: disponibilidad uq_disponibilidad_franja; Type: CONSTRAINT; Schema: public; Owner: saludya_user
--

ALTER TABLE ONLY public.disponibilidad
    ADD CONSTRAINT uq_disponibilidad_franja UNIQUE (especialista_id, sede_id, modalidad, fecha, hora);


--
-- Name: ix_citas_paciente_id; Type: INDEX; Schema: public; Owner: saludya_user
--

CREATE INDEX ix_citas_paciente_id ON public.citas USING btree (paciente_id);


--
-- Name: ix_codigos_otp_paciente_id; Type: INDEX; Schema: public; Owner: saludya_user
--

CREATE INDEX ix_codigos_otp_paciente_id ON public.codigos_otp USING btree (paciente_id);


--
-- Name: ix_disponibilidad_especialista_id; Type: INDEX; Schema: public; Owner: saludya_user
--

CREATE INDEX ix_disponibilidad_especialista_id ON public.disponibilidad USING btree (especialista_id);


--
-- Name: ix_disponibilidad_estado; Type: INDEX; Schema: public; Owner: saludya_user
--

CREATE INDEX ix_disponibilidad_estado ON public.disponibilidad USING btree (estado);


--
-- Name: ix_disponibilidad_fecha; Type: INDEX; Schema: public; Owner: saludya_user
--

CREATE INDEX ix_disponibilidad_fecha ON public.disponibilidad USING btree (fecha);


--
-- Name: ix_disponibilidad_sede_id; Type: INDEX; Schema: public; Owner: saludya_user
--

CREATE INDEX ix_disponibilidad_sede_id ON public.disponibilidad USING btree (sede_id);


--
-- Name: ix_pacientes_numero_documento; Type: INDEX; Schema: public; Owner: saludya_user
--

CREATE UNIQUE INDEX ix_pacientes_numero_documento ON public.pacientes USING btree (numero_documento);


--
-- Name: citas citas_disponibilidad_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: saludya_user
--

ALTER TABLE ONLY public.citas
    ADD CONSTRAINT citas_disponibilidad_id_fkey FOREIGN KEY (disponibilidad_id) REFERENCES public.disponibilidad(id);


--
-- Name: citas citas_paciente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: saludya_user
--

ALTER TABLE ONLY public.citas
    ADD CONSTRAINT citas_paciente_id_fkey FOREIGN KEY (paciente_id) REFERENCES public.pacientes(id);


--
-- Name: codigos_otp codigos_otp_paciente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: saludya_user
--

ALTER TABLE ONLY public.codigos_otp
    ADD CONSTRAINT codigos_otp_paciente_id_fkey FOREIGN KEY (paciente_id) REFERENCES public.pacientes(id);


--
-- Name: disponibilidad disponibilidad_especialista_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: saludya_user
--

ALTER TABLE ONLY public.disponibilidad
    ADD CONSTRAINT disponibilidad_especialista_id_fkey FOREIGN KEY (especialista_id) REFERENCES public.especialistas(id);


--
-- Name: disponibilidad disponibilidad_sede_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: saludya_user
--

ALTER TABLE ONLY public.disponibilidad
    ADD CONSTRAINT disponibilidad_sede_id_fkey FOREIGN KEY (sede_id) REFERENCES public.sedes(id);


--
-- Name: especialista_modalidades especialista_modalidades_especialista_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: saludya_user
--

ALTER TABLE ONLY public.especialista_modalidades
    ADD CONSTRAINT especialista_modalidades_especialista_id_fkey FOREIGN KEY (especialista_id) REFERENCES public.especialistas(id);


--
-- Name: especialista_sedes especialista_sedes_especialista_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: saludya_user
--

ALTER TABLE ONLY public.especialista_sedes
    ADD CONSTRAINT especialista_sedes_especialista_id_fkey FOREIGN KEY (especialista_id) REFERENCES public.especialistas(id);


--
-- Name: especialista_sedes especialista_sedes_sede_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: saludya_user
--

ALTER TABLE ONLY public.especialista_sedes
    ADD CONSTRAINT especialista_sedes_sede_id_fkey FOREIGN KEY (sede_id) REFERENCES public.sedes(id);


--
-- Name: especialistas especialistas_especialidad_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: saludya_user
--

ALTER TABLE ONLY public.especialistas
    ADD CONSTRAINT especialistas_especialidad_id_fkey FOREIGN KEY (especialidad_id) REFERENCES public.especialidades(id);


--
-- Name: pacientes pacientes_eps_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: saludya_user
--

ALTER TABLE ONLY public.pacientes
    ADD CONSTRAINT pacientes_eps_id_fkey FOREIGN KEY (eps_id) REFERENCES public.eps(id);


--
-- PostgreSQL database dump complete
--

\unrestrict qLVkBoJhRejtylQzADtTFzemgIzLrxOdNzaCGe5eisEn6vRUQ6hR1dkLondjeII

