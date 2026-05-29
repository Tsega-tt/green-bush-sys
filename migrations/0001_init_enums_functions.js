'use strict';

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    -- ---------- ENUM types (stable domains) ----------
    CREATE TYPE transaction_type AS ENUM (
      'opening_balance','purchase_receipt','transfer_out','transfer_in',
      'consumption','sale','waste','adjustment','stock_count'
    );
    CREATE TYPE pr_status AS ENUM (
      'draft','pending_fnb','pending_owner','approved','partially_approved',
      'rejected','closed','cancelled'
    );
    CREATE TYPE po_status AS ENUM (
      'draft','issued','partially_received','received','closed','cancelled'
    );
    CREATE TYPE transfer_status AS ENUM (
      'pending_fnb','approved','partially_approved','rejected',
      'sent','received','closed','cancelled'
    );
    CREATE TYPE gr_status AS ENUM ('draft','posted','cancelled');
    CREATE TYPE alert_severity AS ENUM ('info','warning','critical');
    CREATE TYPE alert_status   AS ENUM ('open','acknowledged','resolved','dismissed');
    CREATE TYPE attachment_entity AS ENUM (
      'purchase_requisition','purchase_order','goods_receipt','transfer',
      'stock_count','waste','audit','invoice','other'
    );

    -- ---------- shared trigger functions ----------
    CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
    BEGIN NEW.updated_at = now(); RETURN NEW; END;
    $$ LANGUAGE plpgsql;

    CREATE OR REPLACE FUNCTION prevent_mutation() RETURNS trigger AS $$
    BEGIN
      RAISE EXCEPTION 'Table % is append-only; % is not permitted',
        TG_TABLE_NAME, TG_OP USING ERRCODE = '0A000';
    END;
    $$ LANGUAGE plpgsql;

    -- ---------- document number sequences ----------
    CREATE SEQUENCE seq_inventory_txn;
    CREATE SEQUENCE seq_pr;
    CREATE SEQUENCE seq_po;
    CREATE SEQUENCE seq_gr;
    CREATE SEQUENCE seq_transfer;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP SEQUENCE IF EXISTS seq_transfer, seq_gr, seq_po, seq_pr, seq_inventory_txn;
    DROP FUNCTION IF EXISTS prevent_mutation();
    DROP FUNCTION IF EXISTS set_updated_at();
    DROP TYPE IF EXISTS attachment_entity, alert_status, alert_severity, gr_status,
      transfer_status, po_status, pr_status, transaction_type;
  `);
};
